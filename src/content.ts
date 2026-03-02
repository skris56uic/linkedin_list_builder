(() => {

    interface Profile {
        name: string;
        url: string;
        headline: string;
        location: string;
    }

    type ProfileMap = Record<string, Profile>;

    let selectedProfiles: ProfileMap = {};

    chrome.storage.local.get(['selectedProfiles'], (result: { selectedProfiles?: ProfileMap }) => {
        if (result.selectedProfiles) {
            selectedProfiles = result.selectedProfiles;
        }
        observeMutations();
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message: { action: string; profileUrl?: string }) => {
        if (message.action === 'removeProfile' && message.profileUrl) {
            delete selectedProfiles[message.profileUrl];
            const btn = document.querySelector(`.llb-select-btn[data-llb-url="${message.profileUrl}"]`) as HTMLButtonElement | null;
            if (btn) {
                btn.textContent = 'Select';
                btn.classList.remove('llb-selected');
            }
        } else if (message.action === 'clearAll') {
            selectedProfiles = {};
            document.querySelectorAll('.llb-select-btn').forEach(btn => {
                btn.textContent = 'Select';
                btn.classList.remove('llb-selected');
            });
        }
    });

    async function toggleSelection(profile: Profile, btnElement: HTMLButtonElement): Promise<void> {
        const profileId = profile.url;

        if (selectedProfiles[profileId]) {
            delete selectedProfiles[profileId];
            btnElement.textContent = "Select";
            btnElement.classList.remove("llb-selected");
        } else {
            selectedProfiles[profileId] = profile;
            btnElement.textContent = "Unselect";
            btnElement.classList.add("llb-selected");
        }

        await chrome.storage.local.set({ selectedProfiles });
    }

    // Match edge-creation-*-action (connect, follow, etc.)
    const EDGE_ACTION_REGEX = /^edge-creation-.+-action$/;

    function findEdgeActionBtn(container: Element): Element | null {
        for (const el of container.querySelectorAll('[data-view-name]')) {
            if (EDGE_ACTION_REGEX.test(el.getAttribute('data-view-name') || '')) {
                return el;
            }
        }
        return null;
    }

    function waitForConnectBtn(container: Element, profile: Profile): void {
        const existing = findEdgeActionBtn(container);
        if (existing && existing.parentElement) {
            injectSelectBtn(existing.parentElement, profile);
            return;
        }

        const observer = new MutationObserver((_mutations, obs) => {
            const actionBtn = findEdgeActionBtn(container);
            if (actionBtn && actionBtn.parentElement) {
                obs.disconnect();
                injectSelectBtn(actionBtn.parentElement, profile);
            }
        });

        observer.observe(container, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 5000);
    }

    function injectSelectBtn(parentEl: Element, profile: Profile): void {
        if (parentEl.querySelector('.llb-select-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'llb-select-btn';
        btn.setAttribute('data-llb-url', profile.url);
        const isSelected = !!selectedProfiles[profile.url];

        btn.textContent = isSelected ? "Unselect" : "Select";
        if (isSelected) btn.classList.add("llb-selected");

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleSelection(profile, btn);
        });

        parentEl.appendChild(btn);
    }

    function processCard(card: Element): void {
        if ((card as HTMLElement).dataset.llbProcessed) return;

        let name: string | undefined,
            url: string | undefined,
            headline: string | undefined,
            location: string | undefined,
            actionsContainer: Element | null = null;

        // New Layout
        const titleLinkNew = card.querySelector('[data-view-name="search-result-lockup-title"]') as HTMLAnchorElement | null;
        if (titleLinkNew) {
            name = titleLinkNew.innerText.trim();
            url = titleLinkNew.href.split('?')[0];

            const container = card.closest('[role="listitem"]') || card;
            const allTextParagraphs = container.querySelectorAll('p');

            for (let i = 0; i < allTextParagraphs.length; i++) {
                const p = allTextParagraphs[i];
                if (p.contains(titleLinkNew)) continue;

                if (!headline) { headline = p.innerText.trim(); continue; }
                if (!location) { location = p.innerText.trim(); break; }
            }

            const profile: Profile = { name, url, headline: headline || '', location: location || '' };
            waitForConnectBtn(container, profile);
            (card as HTMLElement).dataset.llbProcessed = "true";
            return;

        } else {
            // Old Layout
            const titleLinkOld = card.querySelector('.entity-result__title-text a') as HTMLAnchorElement | null;
            if (titleLinkOld) {
                name = titleLinkOld.innerText.trim();
                url = titleLinkOld.href.split('?')[0];

                const headlineEl = card.querySelector('.entity-result__primary-subtitle');
                headline = headlineEl ? headlineEl.textContent?.trim() || '' : '';

                const locationEl = card.querySelector('.entity-result__secondary-subtitle');
                location = locationEl ? locationEl.textContent?.trim() || '' : '';

                actionsContainer = card.querySelector('.entity-result__actions');
            }
        }

        if (!url || !name) return;

        const profile: Profile = { name, url, headline: headline || '', location: location || '' };

        const btn = document.createElement('button');
        btn.className = 'llb-select-btn';
        btn.setAttribute('data-llb-url', profile.url);
        const isSelected = !!selectedProfiles[url];

        btn.textContent = isSelected ? "Unselect" : "Select";
        if (isSelected) btn.classList.add("llb-selected");

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleSelection(profile, btn);
        });

        if (actionsContainer) {
            actionsContainer.appendChild(btn);
        } else {
            card.appendChild(btn);
        }

        (card as HTMLElement).dataset.llbProcessed = "true";
    }

    function scanForCards(): void {
        document.querySelectorAll('[data-view-name="people-search-result"]').forEach(processCard);
        document.querySelectorAll('.entity-result__item').forEach(processCard);
    }

    function observeMutations(): void {
        scanForCards();

        const observer = new MutationObserver(() => scanForCards());

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

})();
