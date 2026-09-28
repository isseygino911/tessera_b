import * as orders from '../services/orders.js';

const create = async (req, res) => {
  res.status(201).json(await orders.createOrder({ ...req.body, user: req.user }));
};

const list = async (req, res) => {
  res.json(await orders.listOrders(req.query));
};

const get = async (req, res) => {
  res.json(await orders.getOrderWithItems(req.params.id));
};

const update = async (req, res) => {
  res.json(await orders.updateOrder(req.params.id, req.body));
};

export { create, list, get, update };
