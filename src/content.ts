(() => {

    interface Profile {
        name: string;
        url: string;
        headline: string;
        location: string;
    }

    type ProfileMap = Record<string, Profile>;

    let selectedProfiles: ProfileMap = {};
    let storedCompanyId: string | null = null;

    function getCompanyIdFromUrl(): string | null {
        try {
            const params = new URLSearchParams(window.location.search);
            const raw = params.get('currentCompany');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed[0] : null;
        } catch {
            return null;
        }
    }

    chrome.storage.local.get(['selectedProfiles', 'storedCompanyId'], (result: { selectedProfiles?: ProfileMap; storedCompanyId?: string }) => {
        if (result.selectedProfiles) {
            selectedProfiles = result.selectedProfiles;
        }
        storedCompanyId = result.storedCompanyId || null;

        const currentCompanyId = getCompanyIdFromUrl();
        console.log('[LLB] Current company ID:', currentCompanyId);
        console.log('[LLB] Stored company ID:', storedCompanyId);

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

    function resetAllButtons(): void {
        document.querySelectorAll('.llb-select-btn').forEach(btn => {
            btn.textContent = 'Select';
            btn.classList.remove('llb-selected');
        });
    }

    async function toggleSelection(profile: Profile, btnElement: HTMLButtonElement): Promise<void> {
        const profileId = profile.url;

        if (selectedProfiles[profileId]) {
            delete selectedProfiles[profileId];
            btnElement.textContent = "Select";
            btnElement.classList.remove("llb-selected");
        } else {
            const currentCompanyId = getCompanyIdFromUrl();
            console.log('[LLB] Adding profile — URL company:', currentCompanyId, '| Stored:', storedCompanyId);

            if (currentCompanyId && storedCompanyId && currentCompanyId !== storedCompanyId) {
                console.log('[LLB] Company changed! Clearing all profiles.');
                selectedProfiles = {};
                resetAllButtons();
            }

            if (currentCompanyId) {
                storedCompanyId = currentCompanyId;
            }

            selectedProfiles[profileId] = profile;
            btnElement.textContent = "Unselect";
            btnElement.classList.add("llb-selected");
        }

        await chrome.storage.local.set({ selectedProfiles, storedCompanyId });
    }

    function createSelectBtn(profile: Profile): HTMLDivElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'llb-select-wrapper';
        wrapper.style.gridRow = '1';

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

        wrapper.appendChild(btn);
        return wrapper;
    }

    function processCard(card: Element): void {
        if ((card as HTMLElement).dataset.llbProcessed) return;

        let name: string | undefined,
            url: string | undefined,
            headline: string | undefined,
            location: string | undefined;

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

            if (!url || !name) return;

            const profile: Profile = { name, url, headline: headline || '', location: location || '' };

            // Find the wrapping <a> tag and append at the end
            const cardLink = card.closest('a') || card;
            cardLink.appendChild(createSelectBtn(profile));

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

                if (!url || !name) return;

                const profile: Profile = { name, url, headline: headline || '', location: location || '' };
                const actionsContainer = card.querySelector('.entity-result__actions');

                if (actionsContainer) {
                    actionsContainer.appendChild(createSelectBtn(profile));
                } else {
                    card.appendChild(createSelectBtn(profile));
                }
            }
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
