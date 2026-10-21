import applicationHTML from './application.html';

// The Heart intro (2026-10-03, Luke: "a quick intro rewritten with pages; a
// rules introduction, one or two pages tops", opened in its own window from
// the startup notice). Three pages: where things are on the sheets and in
// the sidebar, then the rules in two pages (rolling; stress and fallout), in
// the system's own words (the system ships no book text). Opened from the
// startup notice's link and from Configure Settings (Open the Intro), so
// anyone can come back to it. A FormApplication only so Foundry's settings
// menu can open it; it has nothing to save.
export const INTRO_PAGES = ['welcome', 'rolling', 'stress'];

export default class HeartIntroApplication extends FormApplication {
    constructor(object = {}, options = {}) {
        super(object, options);
        this.page = 0;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'heart-intro',
            // heart-window: the class Heart's theme (and glass) is scoped to
            classes: ['heart', 'heart-window', 'heart-intro-window'],
            template: applicationHTML.path,
            title: game.i18n.localize('heart.intro.title'),
            width: 680,
            height: 640,
            resizable: true,
            submitOnChange: false,
            closeOnSubmit: false,
        });
    }

    static open(page = 0) {
        const app = Object.values(ui.windows).find(w => w instanceof HeartIntroApplication) ?? new HeartIntroApplication();
        app.page = page;
        app.render(true);
        return app;
    }

    getData() {
        const loc = (k) => game.i18n.localize(`heart.intro.${k}`);
        return {
            pages: INTRO_PAGES.map((id, i) => ({ index: i, n: i + 1, title: loc(`${id}.title`), body: loc(`${id}.body`), active: i === this.page })),
            count: INTRO_PAGES.length,
            previous: loc('previous'),
            next: loc('next'),
        };
    }

    // pages turn in place (no redraw): the tabs, Previous, and Next
    activateListeners(html) {
        super.activateListeners(html);
        const root = html[0];
        const show = (i) => {
            this.page = Math.min(INTRO_PAGES.length - 1, Math.max(0, i));
            root.querySelectorAll('.intro-page').forEach(p => { p.hidden = Number(p.dataset.page) !== this.page; });
            root.querySelectorAll('.intro-tab').forEach(t => t.classList.toggle('active', Number(t.dataset.page) === this.page));
            root.querySelector('[data-action=prev]').disabled = this.page === 0;
            root.querySelector('[data-action=next]').disabled = this.page === INTRO_PAGES.length - 1;
            root.querySelector('.intro-count').textContent = `${this.page + 1} / ${INTRO_PAGES.length}`;
            root.querySelector('.intro-body')?.scrollTo?.(0, 0);
        };
        root.querySelectorAll('.intro-tab').forEach(t => t.addEventListener('click', ev => { ev.preventDefault(); show(Number(t.dataset.page)); }));
        root.querySelector('[data-action=prev]').addEventListener('click', ev => { ev.preventDefault(); show(this.page - 1); });
        root.querySelector('[data-action=next]').addEventListener('click', ev => { ev.preventDefault(); show(this.page + 1); });
        show(this.page);
    }

    async _updateObject() {}
}

// Configure Settings > Open the Intro, for every user
export function initialise() {
    game.settings.registerMenu('heart', 'intro', {
        name: 'Heart Intro',
        label: 'Open the Intro',
        hint: 'Where things are in Heart, and the rules in two pages.',
        icon: 'fas fa-book-open',
        type: HeartIntroApplication,
        restricted: false,
    });
}
