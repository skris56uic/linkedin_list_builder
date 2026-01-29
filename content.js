console.log("LinkedIn List Builder: Content script loaded");

// State to keep track of selected profiles locally for quick UI updates
let selectedProfiles = {};

// Initialize state from storage
chrome.storage.local.get(['selectedProfiles'], (result) => {
    if (result.selectedProfiles) {
        selectedProfiles = result.selectedProfiles;
    }
    observeMutations();
});

// Function to handle saving/removing profile
async function toggleSelection(profile, btnElement) {
    const profileId = profile.url; // Use URL as unique ID

    if (selectedProfiles[profileId]) {
        // Remove
        delete selectedProfiles[profileId];
        btnElement.textContent = "Select";
        btnElement.classList.remove("llb-selected");
    } else {
        // Add
        selectedProfiles[profileId] = profile;
        btnElement.textContent = "Unselect";
        btnElement.classList.add("llb-selected");
    }

    // Update storage
    await chrome.storage.local.set({ selectedProfiles });
}

// Function to process a single search result card
function processCard(card) {
    if (card.dataset.llbProcessed) return;

    let name, url, headline, location, actionsContainer;
    let isNewLayout = false;

    // Strategy A: data-view-name (New Layout)
    const titleLinkNew = card.querySelector('[data-view-name="search-result-lockup-title"]');
    if (titleLinkNew) {
        isNewLayout = true;
        name = titleLinkNew.innerText.trim();
        url = titleLinkNew.href.split('?')[0];

        // Attempt to find headline/location. 
        // In the new layout, these are usually in sibling divs of the title's parent.
        // We traverse up to the common container `li` or `div[role="listitem"]` and search down.
        const container = card.closest('[role="listitem"]') || card;

        // Attempting to simplify finding headline/location by looking for text blocks that are NOT the title
        // The provided HTML shows title in a <p> -> <a>. Headline in a <div ...><p>...
        // Let's rely on visuals or just generic order if specific classes are obfuscated.
        // However, we can try to find the other texts.
        const allTextParagraphs = container.querySelectorAll('p');
        // Usually: 0=Title, 1=Headline, 2=Location (roughly)
        // We skip the one that contains the title.

        for (let i = 0; i < allTextParagraphs.length; i++) {
            const p = allTextParagraphs[i];
            if (p.contains(titleLinkNew)) continue; // This is the title row

            // Next one is likely headline
            if (!headline) {
                headline = p.innerText.trim();
                continue;
            }
            // Next one is likely location
            if (!location) {
                location = p.innerText.trim();
                break;
            }
        }

        // Find action container (Message button area)
        const msgBtn = container.querySelector('[data-view-name="relationship-building-button"]');
        if (msgBtn) {
            // We want to append our button next to this one.
            // The msgBtn is usually inside a container. We can append to that container.
            actionsContainer = msgBtn.parentElement;
        } else {
            // Fallback
            actionsContainer = container.querySelector('.entity-result__actions') || container;
        }

    } else {
        // Strategy B: Legacy classes (Old Layout)
        const titleLinkOld = card.querySelector('.entity-result__title-text a');
        if (titleLinkOld) {
            name = titleLinkOld.innerText.trim();
            url = titleLinkOld.href.split('?')[0];

            const headlineEl = card.querySelector('.entity-result__primary-subtitle');
            headline = headlineEl ? headlineEl.innerText.trim() : "";

            const locationEl = card.querySelector('.entity-result__secondary-subtitle');
            location = locationEl ? locationEl.innerText.trim() : "";

            actionsContainer = card.querySelector('.entity-result__actions');
        }
    }

    if (!url || !name) return;

    const profile = { name, url, headline, location };

    // Create Button
    const btn = document.createElement('button');
    btn.className = 'llb-select-btn';
    const isSelected = !!selectedProfiles[url];

    btn.textContent = isSelected ? "Unselect" : "Select";
    if (isSelected) btn.classList.add("llb-selected");

    // Adjust style for new layout if needed
    if (isNewLayout) {
        btn.style.marginLeft = "8px";
        btn.style.alignSelf = "center";
    }

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSelection(profile, btn);
    });

    // Inject button
    if (actionsContainer) {
        actionsContainer.appendChild(btn);
    } else {
        card.appendChild(btn);
    }

    card.dataset.llbProcessed = "true";
}

function scanForCards() {
    // Strategy A: New Layout
    const cardsNew = document.querySelectorAll('[data-view-name="people-search-result"]');
    cardsNew.forEach(processCard);

    // Strategy B: Old Layout
    const cardsOld = document.querySelectorAll('.entity-result__item');
    cardsOld.forEach(processCard);
}

function observeMutations() {
    scanForCards(); // Initial scan

    const observer = new MutationObserver((mutations) => {
        scanForCards();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}
