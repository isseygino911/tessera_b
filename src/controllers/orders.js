import * as orders from '../services/orders.js';

const create = async (req, res) => {
  res.status(201).json(await orders.createOrder({ ...req.body, user: req.user }));
};

const list = async (req, res) => {
  res.json(await orders.listOrders(req.query.status));
};

const get = async (req, res) => {
  res.json(await orders.getOrderWithItems(req.params.id));
};

const updateStatus = async (req, res) => {
  res.json(await orders.updateOrderStatus(req.params.id, req.body.status));
};

export { create, list, get, updateStatus };
