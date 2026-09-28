import * as summary from '../services/summary.js';

const get = async (req, res) => {
  res.json(await summary.getSummary());
};

export { get };
