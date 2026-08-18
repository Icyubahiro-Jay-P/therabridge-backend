// ============================================================
// MAILING SYSTEM — DISABLED
// No stable email service is configured yet. All sendEmail()
// calls are intercepted here and logged as warnings instead of
// being dispatched. To re-enable, uncomment this block and
// restore the original implementation from git history.
// ============================================================

import logger from "./logger.js";

const sendEmail = async (options) => {
  logger.warn(
    { to: options.email, subject: options.subject },
    "[MAIL DISABLED] sendEmail called but mailing system is offline. Email was NOT delivered.",
  );
};

export default sendEmail;
