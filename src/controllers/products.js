import * as products from '../services/products.js';

const listActive = async (req, res) => {
  res.json(await products.listActiveProducts());
};

const list = async (req, res) => {
  res.json(await products.listProducts());
};

const get = async (req, res) => {
  res.json(await products.getProduct(req.params.id));
};

const create = async (req, res) => {
  res.status(201).json(await products.createProduct(req.body));
};

const update = async (req, res) => {
  res.json(await products.updateProduct(req.params.id, req.body));
};

const remove = async (req, res) => {
  res.json(await products.deleteProduct(req.params.id));
};

export { listActive, list, get, create, update, remove };
