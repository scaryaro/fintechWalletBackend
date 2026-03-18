// src/controllers/pinController.js

const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { success, error } = require('../utils/helpers');

const pinStatus = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { pinSet: true },
    });
    return success(res, { pin_set: user.pinSet });
  } catch (err) { next(err); }
};

const setPin = async (req, res, next) => {
  try {
    const { pin, confirmPin, password } = req.body;
    if (!pin || !/^\d{4,6}$/.test(pin))   return error(res, 'PIN must be 4–6 digits.', 400);
    if (pin !== confirmPin)                 return error(res, 'PINs do not match.', 400);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user.pinSet) return error(res, 'PIN already set. Use change PIN.', 400);

    const pwOk = await bcrypt.compare(password, user.password);
    if (!pwOk) return error(res, 'Incorrect account password.', 401);

    const hashed = await bcrypt.hash(pin, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { transactionPin: hashed, pinSet: true },
    });
    return success(res, {}, 'Transaction PIN set successfully.');
  } catch (err) { next(err); }
};

const changePin = async (req, res, next) => {
  try {
    const { currentPin, newPin, confirmNewPin } = req.body;
    if (!newPin || !/^\d{4,6}$/.test(newPin)) return error(res, 'New PIN must be 4–6 digits.', 400);
    if (newPin !== confirmNewPin)               return error(res, 'New PINs do not match.', 400);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user.pinSet) return error(res, 'No PIN set yet.', 400);

    const ok = await bcrypt.compare(currentPin, user.transactionPin);
    if (!ok) return error(res, 'Current PIN is incorrect.', 401);

    const hashed = await bcrypt.hash(newPin, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { transactionPin: hashed } });
    return success(res, {}, 'PIN changed successfully.');
  } catch (err) { next(err); }
};

const verifyPin = async (req, res, next) => {
  try {
    const { pin } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user.pinSet) return error(res, 'PIN not set.', 400);
    const ok = await bcrypt.compare(String(pin), user.transactionPin);
    if (!ok) return error(res, 'Incorrect PIN.', 401);
    return success(res, {}, 'PIN verified.');
  } catch (err) { next(err); }
};

module.exports = { pinStatus, setPin, changePin, verifyPin };