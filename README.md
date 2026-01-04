# Minibadge Wiki

<img width="1274" height="762" alt="image" src="https://github.com/user-attachments/assets/86b28b9f-c9be-4a7c-ad2b-602278a67b6b" />

https://minibadge.wiki/ 

A filterable/searchable archive of every minibadge I could get my hands on. Data sources come from 2021, 2022, 2023, 2024, and 2025 build guides, as well as a new minibadge submission forum.

## New submission process
1. User submits Minibadge to Google Form, which has CSV export
2. a Github Actions cronjob tries to run the update script every 5 minutes.
3. The update script will grab the CSV export and compare it to the existing list.
4. Changes and additions will be added. The script will only download images for new/updated listings.
5. The update script commits the new JSON file to the repository, triggering a site redeployment through Github pages.
6. Github pages have been rebuilt, and is now serving the updated JSON file. Your browser will pull it in and display minibadges.
