function updateUI(profiles) {
    const countSpan = document.getElementById('count');
    const previewDiv = document.getElementById('preview');

    const ids = Object.keys(profiles);
    countSpan.textContent = ids.length;

    if (ids.length === 0) {
        previewDiv.innerHTML = '<div class="empty-state">No profiles selected yet.</div>';
        return;
    }

    previewDiv.innerHTML = '';
    // Show first 10 for preview
    ids.slice(0, 50).forEach(id => {
        const p = profiles[id];
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.textContent = p.name;
        div.title = p.headline || "";
        previewDiv.appendChild(div);
    });
}

function cleanName(fullName) {
    if (!fullName) return { firstName: '', lastName: '' };

    // Remove content after common separators often used for suffixes/titles in names
    // e.g. "Jane Doe, PHR", "John Smith | Recruiter", "Alice (She/Her)"
    let cleaned = fullName.split(/,|\||\(|•/)[0].trim();

    // Simple split for First/Last
    // Assumption: First word is First Name, rest is Last Name
    const parts = cleaned.split(/\s+/);
    let firstName = "";
    let lastName = "";

    if (parts.length > 0) {
        firstName = parts[0];
        if (parts.length > 1) {
            lastName = parts.slice(1).join(' ');
        }
    }

    // Strip everything except letters (a-z, A-Z) and spaces
    firstName = firstName.replace(/[^a-zA-Z]/g, '').trim();
    lastName = lastName.replace(/[^a-zA-Z ]/g, '').trim();

    return { firstName, lastName };
}

function convertToCSV(profiles, companyUrl) {
    const items = Object.values(profiles);
    if (items.length === 0) return null;

    // Updated headers: Added Email and Responded after Last Name
    const headers = ['First Name', 'Last Name', 'Email', 'Responded', 'Title', 'Location', 'Company', 'URL'];
    const csvRows = [headers.join(',')];

    items.forEach(item => {
        const { firstName, lastName } = cleanName(item.name);

        const row = [
            `"${(firstName || '').replace(/"/g, '""')}"`,
            `"${(lastName || '').replace(/"/g, '""')}"`,
            `""`, // Email (empty)
            `""`, // Responded (empty)
            `"${(item.headline || '').replace(/"/g, '""')}"`,
            `"${(item.location || '').replace(/"/g, '""')}"`,
            `"${(companyUrl || '').replace(/"/g, '""')}"`, // Company
            `"${(item.url || '')}"`
        ];
        csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
}

function downloadCSV(csvContent, fileName) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    // Sanitize filename and ensure .csv extension
    const safeName = (fileName || 'linkedin_profiles').replace(/[^a-zA-Z0-9_\-]/g, '_');
    link.setAttribute('download', safeName + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['selectedProfiles'], (result) => {
        const profiles = result.selectedProfiles || {};
        updateUI(profiles);
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
        const csvNameInput = document.getElementById('csvName');
        const companyUrlInput = document.getElementById('companyUrl');
        const csvNameError = document.getElementById('csvNameError');
        const companyUrlError = document.getElementById('companyUrlError');

        // Reset errors
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

        chrome.storage.local.get(['selectedProfiles'], (result) => {
            const profiles = result.selectedProfiles || {};
            const csv = convertToCSV(profiles, companyUrl);
            if (csv) {
                downloadCSV(csv, csvName);
            } else {
                alert("No profiles to export!");
            }
        });
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
        chrome.storage.local.set({ selectedProfiles: {} }, () => {
            updateUI({});
        });
    });
});
