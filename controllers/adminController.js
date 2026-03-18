// src/controllers/adminController.js

const prisma = require('../config/prisma');
const { success, error } = require('../utils/helpers');

const getStats = async (req, res, next) => {
  try {
    const [totalUsers, walletSum, txStats] = await Promise.all([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.wallet.aggregate({ _sum: { balance: true } }),
      prisma.transaction.groupBy({
        by: ['type', 'status'],
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const deposits = txStats
      .filter(t => t.type === 'DEPOSIT' && t.status === 'SUCCESS')
      .reduce((a, t) => a + parseFloat(t._sum.amount || 0), 0);

    return success(res, {
      stats: {
        total_users: totalUsers,
        total_wallet_balance: walletSum._sum.balance || 0,
        total_deposits: deposits,
        total_transactions: txStats.reduce((a, t) => a + t._count, 0),
      },
    });
  } catch (err) { next(err); }
};

const getUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, fullname: true, email: true, phone: true,
        role: true, isFrozen: true, isVerified: true, createdAt: true,
        wallet:  { select: { balance: true, currency: true } },
        account: { select: { accountNumber: true } },
      },
    });
    return success(res, { users });
  } catch (err) { next(err); }
};

const getAllTransactions = async (req, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { fullname: true, email: true } } },
    });
    return success(res, { transactions });
  } catch (err) { next(err); }
};

const freezeUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { freeze }  = req.body;
    await prisma.user.update({
      where: { id: parseInt(userId) },
      data:  { isFrozen: freeze !== false },
    });
    await prisma.adminLog.create({
      data: {
        adminId: req.user.id,
        targetType: 'user',
        targetId: parseInt(userId),
        action: freeze !== false ? 'freeze_account' : 'unfreeze_account',
        ipAddress: req.ip,
      },
    });
    return success(res, {}, `Account ${freeze !== false ? 'frozen' : 'unfrozen'}.`);
  } catch (err) { next(err); }
};

module.exports = { getStats, getUsers, getAllTransactions, freezeUser };