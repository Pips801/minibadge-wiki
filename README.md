# Minibadge Wiki
https://minibadge.wiki/ 

A filterable/searchable archive of every minibadge I could get my hands on. Data sources come from 2021, 2022, 2023, 2024, and 2025 build guides, as well as a new minibadge submission forum. Includes a statistics page, and a data page where you can download the build guide PDFs or the raw JSON data.

## New submission process
1. User submits Minibadge to Google Form, which has CSV export
2. a Github Actions cronjob tries to run the update script every 5 minutes.
3. The update script will grab the CSV export and compare it to the existing list.
4. Changes and additions will be added. The script will only download images for new/updated listings.
5. The update script commits the new JSON file to the repository, triggering a site redeployment through Github pages.
6. Github pages have been rebuilt, and is now serving the updated JSON file. Your browser will pull it in and display minibadges.

## Images
### Homepage
<img width="900" alt="image" src="https://github.com/user-attachments/assets/32bf6be0-97fb-4329-b023-50de3bd8e8c0" />

### Statistics
<img width="900" alt="image" src="https://github.com/user-attachments/assets/5aae74aa-062c-4308-8e4f-b2a2a0859d48" />

### Data download
<img width="900" alt="image" src="https://github.com/user-attachments/assets/9387d82e-3198-4d4b-aa63-6bf27bac247a" />

