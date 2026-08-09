import { handleAdminChannels, type VercelRequestLike, type VercelResponseLike } from '../../_lib/newsmeter'

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  await handleAdminChannels(req, res, [])
}
