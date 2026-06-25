export function assetUrl(path: string): string {
  const cleanedPath = path.replace(/^\/+/, '')
  const baseUrl = import.meta.env.BASE_URL || './'

  if (baseUrl === './' || baseUrl === '') return cleanedPath

  return `${baseUrl.replace(/\/$/, '')}/${cleanedPath}`
}
