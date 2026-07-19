import { handleAdminChannels, type VercelRequestLike, type VercelResponseLike } from '../../_lib/newsmeter'

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  const raw = req.query.path
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : []
  await handleAdminChannels(req, res, segments)
}
