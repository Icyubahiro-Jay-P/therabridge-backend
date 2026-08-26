function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const { to, subject, html } = payload;

    if (!to || !subject || !html) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, message: "Missing to, subject, or html" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: html,
    });

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: "Email sent" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
