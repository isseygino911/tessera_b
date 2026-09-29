import * as addresses from '../services/addresses.js';

const list = async (req, res) => {
  res.json(await addresses.listAddresses(req.user.id));
};

const create = async (req, res) => {
  res.status(201).json(await addresses.createAddress(req.user.id, req.body));
};

const update = async (req, res) => {
  res.json(await addresses.updateAddress(req.user.id, req.params.id, req.body));
};

const remove = async (req, res) => {
  res.json(await addresses.deleteAddress(req.user.id, req.params.id));
};

export { list, create, update, remove };
