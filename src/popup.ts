(() => {

    interface Profile {
        name: string;
        url: string;
        headline: string;
        location: string;
    }

    type ProfileMap = Record<string, Profile>;

    /**
     * Sends a message to the currently active tab in the current window.
     * Used to communicate with the content script injected into the LinkedIn page.
     * 
     * @param message The payload to send, typically containing an action and optional data.
     */
    function sendToActiveTab(message: { action: string; profileUrl?: string }): void {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, message);
            }
        });
    }

    /**
     * Removes a profile from the local storage based on its URL,
     * updates the popup UI to reflect the change, and notifies the content script
     * to unselect the corresponding button on the LinkedIn page.
     * 
     * @param profileUrl The unique URL of the profile to remove.
     */
    function removeProfile(profileUrl: string): void {
        chrome.storage.local.get(['selectedProfiles'], (result: { selectedProfiles?: ProfileMap }) => {
            const profiles: ProfileMap = result.selectedProfiles || {};
            delete profiles[profileUrl];
            chrome.storage.local.set({ selectedProfiles: profiles }, () => {
                updateUI(profiles);
                sendToActiveTab({ action: 'removeProfile', profileUrl });
            });
        });
    }

    /**
     * Refreshes the popup interface to display the currently selected profiles.
     * Updates the total count and renders a list of profile names with a remove ('×') button.
     * 
     * @param profiles A map of profile URLs to Profile objects.
     */
    function updateUI(profiles: ProfileMap): void {
        const countSpan = document.getElementById('count')!;
        const previewDiv = document.getElementById('preview')!;

        const ids = Object.keys(profiles);
        countSpan.textContent = String(ids.length);

        // Show empty state if no profiles are selected
        if (ids.length === 0) {
            previewDiv.innerHTML = '<div class="empty-state">No profiles selected yet.</div>';
            return;
        }

        previewDiv.innerHTML = '';
        // Limit the preview display to 50 profiles for performance
        ids.slice(0, 50).forEach(id => {
            const p = profiles[id];
            const div = document.createElement('div');
            div.className = 'preview-item';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = p.name;
            nameSpan.title = p.headline || '';

            const closeBtn = document.createElement('button');
            closeBtn.className = 'preview-item-close';
            closeBtn.textContent = '×';
            closeBtn.title = 'Remove';
            closeBtn.addEventListener('click', () => removeProfile(id));

            div.appendChild(nameSpan);
            div.appendChild(closeBtn);
            previewDiv.appendChild(div);
        });
    }

    /**
     * Cleans a full name string, extracting the first and last name.
     * It handles standard cleaning operations such as removing titles,
     * splitting by common delimiters, and stripping out non-alphabetic characters.
     * 
     * @param fullName The raw full name string to process.
     * @returns An object containing the separated first and last names.
     */
    function cleanName(fullName: string): { firstName: string; lastName: string } {
        if (!fullName) return { firstName: '', lastName: '' };

        // Split by common separators to drop titles or pronouns (e.g., "John Doe | Engineer")
        let cleaned = fullName.split(/,|\||\(|•/)[0].trim();

        const parts = cleaned.split(/\s+/);
        let firstName = "";
        let lastName = "";

        if (parts.length > 0) {
            firstName = parts[0];
            if (parts.length > 1) {
                lastName = parts.slice(1).join(' ');
            }
        }

        // Remove any non-letters from first name, and keep only letters/spaces in last name
        firstName = firstName.replace(/[^a-zA-Z]/g, '').trim();
        lastName = lastName.replace(/[^a-zA-Z ]/g, '').trim();

        return { firstName, lastName };
    }

    /**
     * Normalizes a given company URL to ensure consistent formatting in the exported CSV.
     * It strips out the protocol (http/https), the 'www.' prefix, and any trailing slashes.
     * Example: "https://www.example.com/" becomes "example.com".
     */
    function normalizeCompanyUrl(url: string): string {
        if (!url) return '';
        return url
            .replace(/^https?:\/\//i, '') // Remove http:// or https:// (case-insensitive)
            .replace(/^www\./i, '')       // Remove www. (case-insensitive)
            .replace(/\/+$/, '').toLowerCase() + ".com";         // Remove trailing slash(es) & add .com
    }

    /**
     * Converts a map of profiles and a company URL into a formatted CSV string.
     * Ensures all fields are properly escaped to handle commas and quotes inside the data.
     * 
     * @param profiles A map of the selected profiles to export.
     * @param companyUrl The normalized company URL string.
     * @returns A string representing the CSV content, or null if no profiles exist.
     */
    function convertToCSV(profiles: ProfileMap, companyUrl: string): string | null {
        const items = Object.values(profiles);
        if (items.length === 0) return null;

        const headers = ['First Name', 'Last Name', 'Email', 'Responded', 'Title', 'Location', 'Company', 'URL'];
        const csvRows = [headers.join(',')];

        items.forEach(item => {
            const { firstName, lastName } = cleanName(item.name);

            // Wrap fields in double quotes and escape internal quotes by doubling them
            const row = [
                `"${(firstName || '').replace(/"/g, '""')}"`,
                `"${(lastName || '').replace(/"/g, '""')}"`,
                `""`, // Placeholder for 'Email'
                `""`, // Placeholder for 'Responded'
                `"${(item.headline || '').replace(/"/g, '""')}"`,
                `"${(item.location || '').replace(/"/g, '""')}"`,
                `"${(companyUrl || '').replace(/"/g, '""')}"`,
                `"${(item.url || '')}"`
            ];
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    }

    /**
     * Triggers a browser download for the generated CSV string.
     * 
     * @param csvContent The raw CSV string data.
     * @param fileName The desired name for the downloaded file.
     */
    function downloadCSV(csvContent: string, fileName: string): void {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);

        // Ensure the filename only contains safe characters
        const safeName = (fileName || 'linkedin_profiles').replace(/[^a-zA-Z0-9_\-]/g, '_');
        link.setAttribute('download', safeName + '.csv');

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Initialize UI on popup load
    document.addEventListener('DOMContentLoaded', () => {
        // Load initially selected profiles from local storage to populate the view
        chrome.storage.local.get(['selectedProfiles'], (result: { selectedProfiles?: ProfileMap }) => {
            const profiles: ProfileMap = result.selectedProfiles || {};
            updateUI(profiles);
        });

        // Set up listener for the Export CSV button
        document.getElementById('exportBtn')!.addEventListener('click', () => {
            const csvNameInput = document.getElementById('csvName') as HTMLInputElement;
            const companyUrlInput = document.getElementById('companyUrl') as HTMLInputElement;
            const csvNameError = document.getElementById('csvNameError')!;
            const companyUrlError = document.getElementById('companyUrlError')!;

            // Reset error states before validation
            csvNameInput.classList.remove('input-error');
            companyUrlInput.classList.remove('input-error');
            csvNameError.textContent = '';
            companyUrlError.textContent = '';

            let valid = true;
            const csvName = csvNameInput.value.trim();

            // Fetch the raw input URL and normalize it (e.g. remove http:// and trailing slashes)
            const rawCompanyUrl = companyUrlInput.value.trim();
            const companyUrl = normalizeCompanyUrl(rawCompanyUrl);

            // Validate that both CSV file name and Company URL have been provided
            if (!csvName) {
                csvNameInput.classList.add('input-error');
                csvNameError.textContent = 'CSV file name is required.';
                valid = false;
            }
            if (!companyUrl) {
                companyUrlInput.classList.add('input-error');
                companyUrlError.textContent = 'Company URL is required.';
                valid = false;
            }

            // Stop execution if any validation checks failed
            if (!valid) return;

            // Fetch the profiles to convert to CSV and download them
            chrome.storage.local.get(['selectedProfiles'], (result: { selectedProfiles?: ProfileMap }) => {
                const profiles: ProfileMap = result.selectedProfiles || {};
                const csv = convertToCSV(profiles, companyUrl);
                if (csv) {
                    downloadCSV(csv, csvName);
                } else {
                    alert("No profiles to export!");
                }
            });
        });

        // Set up listener for the Clear Selection button
        document.getElementById('clearBtn')!.addEventListener('click', () => {
            // Empties the selected profiles list and propagates changes
            chrome.storage.local.set({ selectedProfiles: {} }, () => {
                updateUI({});
                sendToActiveTab({ action: 'clearAll' });
            });
        });
    });

})();
