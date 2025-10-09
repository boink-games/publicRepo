export class AddGameInfoPage {
    constructor(element, invalidate) {
        this.element = element;
        this.invalidate = invalidate;
        if (typeof this.invalidate === 'function') {
            this.invalidate();
        }
    }

    beforeRender() {
        // no dynamic data required yet
    }

    afterRender() {
        window.setHeaderTitle?.('Share Your Game');
        this.bindActions();
    }

    bindActions() {
        const backButtons = this.element.querySelectorAll('[data-local-action="goBack"]');
        backButtons.forEach(btn => {
            btn.addEventListener('click', () => this.navigateHome());
        });

        const form = this.element.querySelector('#add-game-form');
        if (form) {
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleSubmit(form);
            });
        }
    }

    async navigateHome() {
        this.clearHeader();
        if (window.webSkel?.changeToDynamicPage) {
            await window.webSkel.changeToDynamicPage('news-feed-page', 'app');
        }
    }

    handleSubmit(form) {
        if (!form.reportValidity()) {
            return;
        }
        const toast = document.createElement('div');
        toast.className = 'submission-toast';
        toast.textContent = 'Thanks! Your game submission has been noted.';
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 2200);
        form.reset();
    }

    clearHeader() {
        window.setHeaderTitle?.('Boink.Games');
    }

    afterUnload() {
        this.clearHeader();
    }
}

export default AddGameInfoPage;
