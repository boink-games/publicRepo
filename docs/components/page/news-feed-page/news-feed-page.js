export class NewsFeedPage {
    constructor(element, invalidate) {
        this.element = element;
        this.invalidate = invalidate;
        this.storyCards = [];
        this.posts = [];
        this.boundNextStory = this.nextStory.bind(this);
        this.touchStartY = 0;
        this.touchEndY = 0;
        this.touchStartX = 0;
        this.touchEndX = 0;
        this._navLock = false; // prevents double-advance on same gesture
        this.isLoadingMore = false;
        this._postsLoaded = false;
        this.invalidate();
    }

    async beforeRender() {
        if (this._postsLoaded) {
            try { window.logTS('NF: beforeRender skipped (already loaded)'); } catch (_) {}
            return;
        }
        try { if (window.__LOGS_ENABLED) { console.time('NF: full load'); console.time('NF: waiting UI'); } } catch (_) {}
        // Always start on selection card; do not jump to first item automatically
        this.startAtFirstNews = false;
        const hasVisited = await window.LocalStorage.get('hasVisitedBefore');
        if (!hasVisited) {
            const tutorialPost = this.createTutorialPost();
            const localPosts = await window.LocalStorage.get('posts') || [];
            localPosts.unshift(tutorialPost);
            await window.LocalStorage.set('posts', localPosts);
            await window.LocalStorage.set('hasVisitedBefore', true);
        }
        
        const localPosts = await window.LocalStorage.get('posts') || [];
        
        let jsonPosts = [];
        try {
            if (window.__LOGS_ENABLED) console.time('NF: beforeRender total');
            // Try to load from configured external URLs first (support tagged sources)
            const externalSources = await window.LocalStorage.get('externalPostSources') || [];

            const { categories: selected, external: selectedExternalUrls } = await window.SourcesManager.getSelectedSources();
            const externalUrls = (Array.isArray(selectedExternalUrls) ? selectedExternalUrls : []).filter(Boolean);
            if (window.__LOGS_ENABLED) window.logTS('NF: selected external URLs', { count: externalUrls.length });

            // Fetch external sources in parallel
            const externalFetches = externalUrls.map(url => (
                fetch(url, { cache: 'no-store' })
                    .then(r => r.ok ? r.json() : [])
                    .catch(err => { console.error(`Could not fetch posts from ${url}:`, err); return []; })
            ));


            if (window.__LOGS_ENABLED) window.logTS('NF: selected categories', { count: selected.length });

            // Fetch category sources in parallel
            const categoryFetches = selected.map(cat => {
                try {
                    // Folder name matches category id; migrate legacy 'allAges' to 'classicArcade'
                    const folder = (cat === 'allAges') ? 'classicArcade' : cat;
                    // Build default local path; now using games.json for games
                    const sourceUrl = `./sources/${folder}/games.json`;
                    const fullUrl = sourceUrl.startsWith('/') ? `.${sourceUrl}` : sourceUrl;
                    return fetch(fullUrl, { cache: 'no-store' })
                        .then(r => r.ok ? r.json() : [])
                        .catch(err => { console.warn(`Could not load source ${cat}`, err); return []; });
                } catch (e) {
                    console.warn(`Could not build URL for source ${cat}`, e);
                    return Promise.resolve([]);
                }
            });

            // Run both groups in parallel and time them individually
            const extPromise = Promise.all(externalFetches);
            const catPromise = Promise.all(categoryFetches);
            if (window.__LOGS_ENABLED) {
                console.time('NF: fetch externals');
                extPromise.then(() => console.timeEnd('NF: fetch externals'));
                console.time('NF: fetch categories');
                catPromise.then(() => console.timeEnd('NF: fetch categories'));
            }
            const [externalResults, categoryResults] = await Promise.all([extPromise, catPromise]);
            let extPosts = 0, catPosts = 0;
            for (const arr of externalResults) { if (Array.isArray(arr)) { jsonPosts = jsonPosts.concat(arr); extPosts += arr.length; } }
            // Rebuild mapping: iterate selected categories to align
            for (let i = 0; i < selected.length; i++) {
                const cat = selected[i];
                const arr = categoryResults[i];
                if (Array.isArray(arr)) {
                    const mapped = arr.map(g => ({ ...g, tag: g.tag || ((cat === 'allAges' ? 'classicArcade' : cat)), type: g.type || 'microgame' }));
                    jsonPosts = jsonPosts.concat(mapped);
                    catPosts += arr.length;
                }
            }
            if (window.__LOGS_ENABLED) window.logTS('NF: posts from sources', { external: extPosts, category: catPosts });
        } catch (error) {
            console.error("Could not fetch games.json:", error);
        }

        // Create selection post
        const selectionPost = {
            id: "selection-card",
            title: "Select Game Sources",
            essence: "Welcome to Boink.Games! Pick your game categories below:",
            reactions: [],
            source: "#",
            isSelectionCard: true
        };
        
        // Ensure selection post is first
        const allPosts = [selectionPost, ...jsonPosts, ...localPosts];

        // Ensure every post has a stable id for tracking/ordering
        if (window.__LOGS_ENABLED) console.time('NF: ensure ids');
        const ensureId = (p) => {
            try {
                if (p && !p.id) {
                    const date = p.publishedAt || p.generatedAt || p.pubDate || p.date || p.createdAt || '';
                    const src = p.source || p.url || '';
                    const title = p.title || '';
                    p.id = `${src}|${title}|${date}`.slice(0, 256);
                }
            } catch (_) {}
            return p;
        };
        allPosts.forEach(ensureId);
        if (window.__LOGS_ENABLED) console.timeEnd('NF: ensure ids');

        // Filter out posts that look like HTML/code or have too-short pages
        const isLikelyHtmlOrCode = (text = '') => {
            if (!text || typeof text !== 'string') return false;
            const htmlTag = /<\/?[a-z][^>]*>/i;
            const codeFence = /```|<script|function\s|class\s|\{\s*\}|console\.|import\s|export\s|;\s*\n/mi;
            const attrs = /\s(?:class|style|id|onclick|onerror|href|src)=/i;
            return htmlTag.test(text) || codeFence.test(text) || attrs.test(text);
        };
        const wordCount = (text = '') => (text.trim().match(/\b\w+\b/g) || []).length;
        const isValidPost = (p) => {
            if (!p) return false;
            // Keep selection card, tutorial/fallback posts regardless
            if (typeof p.id === 'string' && (p.id === 'selection-card' || p.id.startsWith('tutorial-') || p.id.startsWith('fallback-'))) return true;
            // Allow microgames without strict text checks
            if (p.type === 'microgame') return true;
            const pages = [];
            if (p.essence) pages.push(p.essence);
            if (Array.isArray(p.reactions)) pages.push(...p.reactions.filter(Boolean));
            if (pages.length === 0) return false;
            // Reject if any page looks like html/code
            if (pages.some(isLikelyHtmlOrCode)) return false;
            // Require each page to have at least 15 words
            if (pages.some(txt => wordCount(txt) < 15)) return false;
            return true;
        };
        
        // De-dup fast using a Set, then validate
        if (window.__LOGS_ENABLED) console.time('NF: dedup');
        const seenIds = new Set();
        const uniquePosts = [];
        for (const p of allPosts) {
            if (!p || !p.id) continue;
            if (seenIds.has(p.id)) continue;
            seenIds.add(p.id);
            uniquePosts.push(p);
        }
        if (window.__LOGS_ENABLED) console.timeEnd('NF: dedup');
        if (window.__LOGS_ENABLED) console.time('NF: validate');
        const filteredPosts = uniquePosts.filter(isValidPost);
        if (window.__LOGS_ENABLED) console.timeEnd('NF: validate');
        if (window.__LOGS_ENABLED) window.logTS('NF: counts', { all: allPosts.length, unique: uniquePosts.length, valid: filteredPosts.length });

        // Get viewing history data: which posts have ever been centered (brought in prime plan)
        const centeredMap = await window.LocalStorage.get('postCenteredHistory') || {};
        
        // Helper to get the publication/generation date
        const getDate = (p) => {
            // Try multiple date fields
            const dateStr = p.publishedAt || p.generatedAt || p.pubDate || p.date || p.createdAt;
            if (dateStr) {
                const date = new Date(dateStr);
                return isNaN(date.getTime()) ? 0 : date.getTime();
            }
            return 0;
        };
        
        // Weight-based sorting:
        // - weight = age in hours (1..1000)
        // - if previously viewed (centered), weight = 2000
        const buildStableKey = (p) => {
            try {
                const src = (p.source || p.url || '').trim().toLowerCase();
                const date = (p.publishedAt || p.generatedAt || p.pubDate || p.date || p.createdAt || '').trim();
                return src ? `${src}|${date}` : (p.id || `${(p.title||'').trim()}|${date}`);
            } catch (_) { return p.id; }
        };
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
        if (window.__LOGS_ENABLED) console.time('NF: compute weights');
        const now = Date.now();
        filteredPosts.forEach(p => {
            const ts = getDate(p);
            const ageHours = ts ? Math.floor((now - ts) / (1000 * 60 * 60)) : 1000;
            const baseWeight = clamp(ageHours, 1, 1000);
            const key = buildStableKey(p);
            const seen = !!(centeredMap[key]?.centered || centeredMap[p.id]?.centered);
            p.__weight = seen ? 2000 : baseWeight;
            p.__ts = ts || 0; // for tie-breaker
        });
        if (window.__LOGS_ENABLED) console.timeEnd('NF: compute weights');
        if (window.__LOGS_ENABLED) console.time('NF: sort');
        // Keep selection card pinned at index 0 regardless of weights
        const selection = filteredPosts.find(p => p.id === 'selection-card');
        const others = filteredPosts.filter(p => p.id !== 'selection-card');
        const sortedOthers = others.sort((a, b) => {
            if (a.__weight !== b.__weight) return a.__weight - b.__weight;
            return b.__ts - a.__ts; // prefer newer when same weight
        });
        // Ensure tutorial appears right after selection (index 1) only once per day
        const today = new Date();
        const ymd = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;
        const shownKey = 'shownTutorialDate';
        let shouldShowTutorial = false;
        try { const shown = await window.LocalStorage.get(shownKey); if (shown !== ymd) shouldShowTutorial = true; } catch(_) { shouldShowTutorial = true; }
        if (shouldShowTutorial) {
            const tutorialIdx = sortedOthers.findIndex(p => typeof p.id === 'string' && p.id.startsWith('tutorial-'));
            if (tutorialIdx > 0) { const [tutorial] = sortedOthers.splice(tutorialIdx, 1); sortedOthers.unshift(tutorial); }
            try { await window.LocalStorage.set(shownKey, ymd); } catch(_){}
        } else {
            const tIdx = sortedOthers.findIndex(p => typeof p.id === 'string' && p.id.startsWith('tutorial-'));
            if (tIdx >= 0) sortedOthers.splice(tIdx, 1);
        }
        this.posts = selection ? [selection, ...sortedOthers] : sortedOthers;
        if (window.__LOGS_ENABLED) console.timeEnd('NF: sort');
        if (window.__LOGS_ENABLED) console.timeEnd('NF: beforeRender total');
        if (window.__LOGS_ENABLED) window.logTS('NF: posts ready', { count: this.posts.length });

        if (this.posts.length === 0) {
            // This should now only happen if both local storage and JSON are empty
            this.posts = [this.createFallbackPost()];
        }
        this._postsLoaded = true;
    }

    async afterRender() {
        const container = this.element.querySelector('.news-feed-container');
        if (!container) {
            console.error("Fatal error: .news-feed-container not found.");
            return;
        }

        // Clear placeholder (loading/progress state)
        const placeholder = container.querySelector('.story-card-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        container.innerHTML = '';

        await customElements.whenDefined('story-card');
        this.posts.forEach((post, idx) => {
            const el = document.createElement('story-card');
            el.setAttribute('data-presenter', 'story-card');
            el.post = post;
            el.game = post;
            el.storyIndex = idx;
            el.totalStories = this.posts.length;
            container.appendChild(el);
        });
    }



    async loadMoreStories() {
        // Prevent multiple loads
        if (this.isLoadingMore) return;
        this.isLoadingMore = true;

        const container = this.element.querySelector('.news-feed-container');
        container.classList.add('loading');
        try { window.logTS('NF: loadMoreStories start'); } catch (_) {}

        // Duplicate existing posts for infinite scroll
        const newPosts = [...this.posts];
        
        for (const post of newPosts) {
            const storyCardElement = document.createElement('story-card');
            storyCardElement.setAttribute('data-presenter', 'story-card');
            storyCardElement.post = post;
            storyCardElement.game = post;
            const newIndex = this.posts.length; // Append semantics
            storyCardElement.storyIndex = newIndex;
            storyCardElement.setAttribute('data-index', String(newIndex));
            storyCardElement.totalStories = this.posts.length * 2; // Update total
            const bottomSpacer = container.querySelector('.bottom-spacer');
            container.insertBefore(storyCardElement, bottomSpacer || null);

            // Wait for presenter to be ready
            await customElements.whenDefined('story-card');
            await storyCardElement.presenterReadyPromise;
            if (storyCardElement.webSkelPresenter) {
                this.storyCardsMap.set(newIndex, storyCardElement.webSkelPresenter);
            }
            this.cardEls.set(newIndex, storyCardElement);
            this.posts.push(post);
        }
        try { window.logTS('NF: loadMoreStories done', { added: newPosts.length }); } catch (_) {}
        container.classList.remove('loading');
        try { window.logTS('NF: loadMoreStories end'); } catch (_) {}
        this.isLoadingMore = false;
    }

    nextStory() {
        const container = this.element.querySelector('.news-feed-container');
        if (this.currentStoryIndex < this.posts.length - 1) {
            this.currentStoryIndex++;
            try {
                const post = this.posts?.[this.currentStoryIndex];
                window.logTS('NF: nextStory', { index: this.currentStoryIndex, id: post?.id });
            } catch (_) {}
            this.ensureVirtualWindow(this.currentStoryIndex);
            const el = this.cardEls.get(this.currentStoryIndex);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    previousStory() {
        const container = this.element.querySelector('.news-feed-container');
        if (this.currentStoryIndex > 0) {
            this.currentStoryIndex--;
            try {
                const post = this.posts?.[this.currentStoryIndex];
                window.logTS('NF: previousStory', { index: this.currentStoryIndex, id: post?.id });
            } catch (_) {}
            this.ensureVirtualWindow(this.currentStoryIndex);
            const el = this.cardEls.get(this.currentStoryIndex);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    cleanup() {
        this.element.removeEventListener('story-finished', this.boundNextStory);
        const container = this.element.querySelector('.news-feed-container');
        if (container) {
            if (this._onTouchStart) container.removeEventListener('touchstart', this._onTouchStart);
            if (this._onTouchEnd) container.removeEventListener('touchend', this._onTouchEnd);
            if (this._onUserNextReq) container.removeEventListener('user-request-next-post', this._onUserNextReq);
        }
        // Cleanup presenters
        try { this.storyCardsMap.forEach(p => p?.cleanup && p.cleanup()); } catch (_) {}
    }

    createTutorialPost() {
        return {
            id: "tutorial-1",
            title: "Welcome to Boink.Games!",
            essence: "Boink.Games is a mobile-first games feed. Each card shows a short description and a Play button. Tap Play to open the game in a focused popup sized for phones.",
            reactions: [
                "Swipe UP or DOWN to move between games.",
                "Swipe LEFT to view more details about a game.",
                "Tap PLAY on the first slide to start the game in a popup.",
                "Use Manage Sources on the first card to pick categories."
            ],
            source: "#",
            backgroundColor: "purple"
        };
    }

    createFallbackPost() {
        return {
            id: "fallback-1",
            title: "No games available",
            essence: "It seems there are no games available right now. Please check back later or add sources using Manage Sources.",
            reactions: [],
            source: "#",
            backgroundColor: "night"
        };
    }
}
