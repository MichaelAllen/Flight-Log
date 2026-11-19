const downloads = new Map<string, Promise<Blob>>();

export function downloadPdf(url: string): Promise<Blob> {
  const existing = downloads.get(url);
  if (existing) return existing;

  const download = fetch(url, { priority: "low" })
    .then((response) => {
      if (!response.ok) throw new Error("PDF download failed");
      return response.blob();
    })
    .catch((error) => {
      downloads.delete(url);
      throw error;
    });
  downloads.set(url, download);
  return download;
}
