(() => {

    interface Profile {
        name: string;
        url: string;
        headline: string;
        location: string;
    }

    type ProfileMap = Record<string, Profile>;

    function updateUI(profiles: ProfileMap): void {
        const countSpan = document.getElementById('count')!;
        const previewDiv = document.getElementById('preview')!;

        const ids = Object.keys(profiles);
        countSpan.textContent = String(ids.length);

        if (ids.length === 0) {
            previewDiv.innerHTML = '<div class="empty-state">No profiles selected yet.</div>';
            return;
        }

        previewDiv.innerHTML = '';
        ids.slice(0, 50).forEach(id => {
            const p = profiles[id];
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.textContent = p.name;
            div.title = p.headline || "";
            previewDiv.appendChild(div);
        });
    }

    function cleanName(fullName: string): { firstName: string; lastName: string } {
        if (!fullName) return { firstName: '', lastName: '' };

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

        firstName = firstName.replace(/[^a-zA-Z]/g, '').trim();
        lastName = lastName.replace(/[^a-zA-Z ]/g, '').trim();

        return { firstName, lastName };
    }

    function convertToCSV(profiles: ProfileMap, companyUrl: string): string | null {
        const items = Object.values(profiles);
        if (items.length === 0) return null;

        const headers = ['First Name', 'Last Name', 'Email', 'Responded', 'Title', 'Location', 'Company', 'URL'];
        const csvRows = [headers.join(',')];

        items.forEach(item => {
            const { firstName, lastName } = cleanName(item.name);

            const row = [
                `"${(firstName || '').replace(/"/g, '""')}"`,
                `"${(lastName || '').replace(/"/g, '""')}"`,
                `""`,
                `""`,
                `"${(item.headline || '').replace(/"/g, '""')}"`,
                `"${(item.location || '').replace(/"/g, '""')}"`,
                `"${(companyUrl || '').replace(/"/g, '""')}"`,
                `"${(item.url || '')}"`
            ];
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    }

    function downloadCSV(csvContent: string, fileName: string): void {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const safeName = (fileName || 'linkedin_profiles').replace(/[^a-zA-Z0-9_\-]/g, '_');
        link.setAttribute('download', safeName + '.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    document.addEventListener('DOMContentLoaded', () => {
        chrome.storage.local.get(['selectedProfiles'], (result: { selectedProfiles?: ProfileMap }) => {
            const profiles: ProfileMap = result.selectedProfiles || {};
            updateUI(profiles);
        });

        document.getElementById('exportBtn')!.addEventListener('click', () => {
            const csvNameInput = document.getElementById('csvName') as HTMLInputElement;
            const companyUrlInput = document.getElementById('companyUrl') as HTMLInputElement;
            const csvNameError = document.getElementById('csvNameError')!;
            const companyUrlError = document.getElementById('companyUrlError')!;

            csvNameInput.classList.remove('input-error');
            companyUrlInput.classList.remove('input-error');
            csvNameError.textContent = '';
            companyUrlError.textContent = '';

            let valid = true;
            const csvName = csvNameInput.value.trim();
            const companyUrl = companyUrlInput.value.trim();

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
            if (!valid) return;

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

        document.getElementById('clearBtn')!.addEventListener('click', () => {
            chrome.storage.local.set({ selectedProfiles: {} }, () => {
                updateUI({});
            });
        });
    });

})();
