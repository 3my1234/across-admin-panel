/* Direct uploads stay between the browser and S3; API credentials are never forwarded. */
((root) => {
  "use strict";
  const guidance = {
    InvalidAccessKeyId: "The upload service is using an AWS key that no longer exists. Atlantic Express must update its backend storage credentials.",
    ExpiredToken: "The upload service's AWS credentials have expired. Atlantic Express must renew its backend storage credentials.",
    InvalidToken: "The upload service's AWS credentials are invalid. Atlantic Express must check its backend storage credentials.",
    AccessDenied: "AWS denied this upload. Atlantic Express must check that its active storage key has permission to upload to this bucket.",
    SignatureDoesNotMatch: "AWS could not verify this upload link. Atlantic Express must check its storage signing credentials and configuration.",
    RequestTimeTooSkewed: "The upload server's clock does not match AWS. Atlantic Express must correct the server time.",
    RequestExpired: "This upload link has expired. Please try uploading the file again.",
    AuthorizationHeaderMalformed: "The upload service's AWS region or signing configuration is incorrect.",
    PermanentRedirect: "The upload service is using the wrong bucket endpoint. Atlantic Express must check its AWS region."
  };
  function storageError(status, body, headerRequestID = "") {
    let code = "", requestID = headerRequestID;
    try {
      const xml = new DOMParser().parseFromString(body, "application/xml");
      code = xml.querySelector("Error > Code")?.textContent?.trim() || "";
      requestID = xml.querySelector("Error > RequestId")?.textContent?.trim() || requestID;
    } catch (_) {}
    // Only safe identifiers are displayed, never AWS response text, URLs, or credentials.
    code = /^[A-Za-z0-9]{1,80}$/.test(code) ? code : "";
    requestID = /^[A-Za-z0-9-]{1,100}$/.test(requestID) ? requestID : "";
    const detail = guidance[code] || "Storage rejected the upload. Please contact Atlantic Express support with this error.";
    return new Error(`${detail} (HTTP ${status}${code ? `; ${code}` : ""}${requestID ? `; request ${requestID}` : ""})`);
  }
  async function upload(file, signed) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      let response;
      try {
        response = await fetch(signed.upload_url, {
          method: "PUT", headers: { "Content-Type": String(file.type).trim().toLowerCase() },
          body: file, signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer"
        });
      } catch (error) {
        if (error.name === "AbortError") throw new Error("The file upload timed out. Check your connection and try again.");
        throw new Error("The browser could not complete the storage upload. Check your connection. If it continues, contact Atlantic Express support to check storage access and browser CORS settings.");
      }
      if (!response.ok) throw storageError(response.status, await response.text(), response.headers.get("x-amz-request-id") || "");
      return signed.view_url;
    } finally { clearTimeout(timer); }
  }
  root.PortalStorageUpload = Object.freeze({ upload, storageError });
})(typeof window === "undefined" ? globalThis : window);
