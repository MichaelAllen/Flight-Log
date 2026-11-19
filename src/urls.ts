/** Resolve public files against Vite's deployment base, including project Pages. */
export function withBasePath(file: string, base = "/") {
  const prefix = `/${base.replace(/^\/+|\/+$/g, "")}`.replace(/\/?$/, "/");
  return prefix + file.replace(/^\/+/, "");
}

export function siteUrl(file: string) {
  return withBasePath(file, import.meta.env.BASE_URL);
}
