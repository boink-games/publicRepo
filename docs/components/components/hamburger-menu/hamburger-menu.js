const ACTIONS = {
    navigateToHome: 'navigateToHome',
    navigateToAddGame: 'navigateToAddGame',
    navigateToFavorites: 'navigateToFavorites',
    navigateToManageSources: 'navigateToManageSources',
    toggleTheme: 'toggleTheme'
};

export class HamburgerMenu {
    constructor(element, invalidate) {
        this.element = element;
        this.invalidate = invalidate;
        this.isOpen = false;

        this.handleGlobalClick = this.handleGlobalClick.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleOverlayClick = this.handleOverlayClick.bind(this);
        this.handleActionClick = this.handleActionClick.bind(this);

        if (typeof this.invalidate === 'function') {
            this.invalidate();
        }
    }

    beforeRender() {
        // Ensure theme label stays in sync whenever the component re-renders
        this.updateThemeLabel();
    }

    afterRender() {
        this.panel = this.element.querySelector('.hamburger-panel');
        this.themeLabel = this.element.querySelector('.theme-label');
        this.themeIcon = this.element.querySelector('[data-theme-icon] i');

        // Remove previous listeners to avoid duplicates when re-rendering
        this.detachActionListeners();

        this.actionLinks = Array.from(this.element.querySelectorAll('[data-local-action]')); // store for cleanup
        this.actionLinks.forEach(link => link.addEventListener('click', this.handleActionClick));

        this.element.removeEventListener('click', this.handleOverlayClick);
        this.element.addEventListener('click', this.handleOverlayClick);

        this.updateThemeLabel();
    }

    afterUnload() {
        this.detachActionListeners();
        this.element.removeEventListener('click', this.handleOverlayClick);
        this.removeGlobalListeners();
    }

    detachActionListeners() {
        if (!this.actionLinks || !Array.isArray(this.actionLinks)) return;
        this.actionLinks.forEach(link => link.removeEventListener('click', this.handleActionClick));
        this.actionLinks = [];
    }

    toggle(forceState) {
        const shouldOpen = typeof forceState === 'boolean' ? forceState : !this.isOpen;
        if (shouldOpen) {
            this.open();
        } else {
            this.close();
        }
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.element.classList.add('open');
        this.addGlobalListeners();
        this.updateThemeLabel();
        this.focusFirstItem();
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.element.classList.remove('open');
        this.removeGlobalListeners();
    }

    focusFirstItem() {
        try {
            const firstLink = this.element.querySelector('[data-local-action]');
            if (firstLink) {
                firstLink.focus({ preventScroll: true });
            }
        } catch (_) {
            // no-op if focus fails
        }
    }

    addGlobalListeners() {
        document.addEventListener('click', this.handleGlobalClick, true);
        document.addEventListener('keydown', this.handleKeyDown);
    }

    removeGlobalListeners() {
        document.removeEventListener('click', this.handleGlobalClick, true);
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    handleOverlayClick(evt) {
        if (!this.isOpen) return;
        if (!this.panel) return;
        if (this.panel.contains(evt.target)) return; // clicks inside panel are handled elsewhere
        this.close();
    }

    handleGlobalClick(evt) {
        if (!this.isOpen) return;
        const hamburgerButton = document.querySelector('#hamburger-button');
        if (hamburgerButton && hamburgerButton.contains(evt.target)) return;
        if (this.panel && this.panel.contains(evt.target)) return;
        this.close();
    }

    handleKeyDown(evt) {
        if (!this.isOpen) return;
        if (evt.key === 'Escape') {
            evt.preventDefault();
            this.close();
        }
    }

    async handleActionClick(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        const action = evt.currentTarget?.dataset?.localAction;
        if (!action) return;

        await this.performAction(action);
    }

    async performAction(action) {
        switch (action) {
            case ACTIONS.navigateToHome:
                this.close();
                window.setHeaderTitle?.('Boink.Games');
                if (window.webSkel?.changeToDynamicPage) {
                    window.webSkel.changeToDynamicPage('news-feed-page', 'app').catch(err => console.error('Failed to load home page', err));
                }
                break;
            case ACTIONS.navigateToAddGame:
                this.close();
                if (window.webSkel?.changeToDynamicPage) {
                    window.webSkel.changeToDynamicPage('add-game-info-page', 'app').catch(err => console.error('Failed to load add-game page', err));
                }
                break;
            case ACTIONS.navigateToFavorites:
                this.close();
                window.setHeaderTitle?.('Favorites');
                if (window.webSkel?.changeToDynamicPage) {
                    window.webSkel.changeToDynamicPage('favorites-page', 'app').catch(err => console.error('Failed to load favorites page', err));
                }
                break;
            case ACTIONS.navigateToManageSources:
                this.close();
                if (window.webSkel?.showModal) {
                    try {
                        await window.webSkel.showModal('manage-sources-modal', {}, true);
                    } catch (err) {
                        console.error('Failed to open Manage Sources modal', err);
                    }
                }
                break;
            case ACTIONS.toggleTheme:
                window.ThemeManager?.toggleTheme?.();
                this.updateThemeLabel();
                break;
            default:
                console.warn('Unhandled hamburger menu action', action);
                this.close();
        }
    }

    updateThemeLabel() {
        try {
            const theme = window.ThemeManager?.theme || document.documentElement.getAttribute('data-theme');
            if (this.themeLabel) {
                const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
                this.themeLabel.textContent = label;
            }
            if (this.themeIcon) {
                this.themeIcon.classList.remove('fa-moon', 'fa-sun');
                this.themeIcon.classList.add(theme === 'dark' ? 'fa-sun' : 'fa-moon');
            }
        } catch (err) {
            console.error('Failed to update theme label', err);
        }
    }
}

export default HamburgerMenu;
