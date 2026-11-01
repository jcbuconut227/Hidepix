// Saves the finished PNG on desktop and on phones.
// Phones only allow sharing/downloading right inside a tap, so the File must already exist before the tap
// (App.tsx prepares it when hiding finishes) and this function must not wait for anything first.
export function saveImage(file: File, url: string): void {
  const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isPhone && navigator.canShare?.({ files: [file] })) {
    // Opens the share sheet: Save to Files, Save Image / Add to Photos, send as a file...
    navigator.share({ files: [file] }).catch((e) => {
      if (e?.name !== "AbortError") plainDownload(url, file.name); // closing the sheet is not an error
    });
    return;
  }
  plainDownload(url, file.name);
}

function plainDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// Messenger, Instagram, Facebook, TikTok... open links in their own browser, which usually blocks downloads.
export function inAppBrowser(): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|TikTok|Snapchat|; wv\)/i.test(navigator.userAgent);
}