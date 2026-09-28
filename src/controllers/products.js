import * as products from '../services/products.js';
import * as productImages from '../services/productImages.js';

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

const addImage = async (req, res) => {
  await productImages.addImage(req.params.id, req.body, req.headers['content-type']);
  res.status(201).json(await products.getProduct(req.params.id));
};

const updateImage = async (req, res) => {
  await productImages.updateImage(req.params.id, req.params.imageId, req.body);
  res.json(await products.getProduct(req.params.id));
};

const removeImage = async (req, res) => {
  await productImages.deleteImage(req.params.id, req.params.imageId);
  res.json(await products.getProduct(req.params.id));
};

export { listActive, list, get, create, update, remove, addImage, updateImage, removeImage };
