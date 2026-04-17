# AARK Contact Form Setup

This site now submits the contact form through FormSubmit for email delivery and forwards each submission to Google Sheets through a Google Apps Script webhook.

## 1. Create the Google Sheet

- Create a Google Sheet for contact submissions.
- Copy the Sheet ID from the URL.

Example:

```text
https://docs.google.com/spreadsheets/d/1saOKB_w_IpsScAcw6-nabWOgvaBiaB4YzmstB2yo1ec/edit
```

## 2. Deploy the Apps Script webhook

- Open [google-apps-script/contact-form-webhook.gs](/Users/sravankumarraparthi/Documents/aark_website/google-apps-script/contact-form-webhook.gs:1)
- In Google Apps Script, create a new project and paste the file contents.
- `CONFIG.spreadsheetId` is already set to `1saOKB_w_IpsScAcw6-nabWOgvaBiaB4YzmstB2yo1ec`.
- Deploy it as a Web App:
  - Execute as: `Me`
  - Who has access: `Anyone`
- Copy the deployed Web App URL.

## 3. Add the Web App URL to the website

- Open [aark-website.html](/Users/sravankumarraparthi/Documents/aark_website/aark-website.html:2300)
- Replace:

```js
sheetsWebhookUrl: 'PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE',
```

- With your deployed Apps Script URL.

## 4. Activate FormSubmit

- Submit the form once from the live site.
- FormSubmit will send a confirmation email to `aarkfusion@gmail.com`.
- Confirm that email once so future form messages are delivered.

## Notes

- The contact form will not submit correctly from a plain `file://` preview. Use a local server or a deployed site.
- Once configured, each form message will:
  - arrive in `aarkfusion@gmail.com`
  - be appended to your Google Sheet
