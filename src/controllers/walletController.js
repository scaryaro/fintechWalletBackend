// src/controllers/walletController.js

const prisma  = require('../config/prisma');
const { generateReference, success, error } = require('../utils/helpers');
const EmailService = require('../services/emailService');
const axios = require('axios');

// ── GET /api/wallet/dashboard ─────────────────────────────────
const getDashboard = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, fullname: true, email: true, phone: true,
        isVerified: true, pinSet: true,
        wallet:  { select: { balance: true, currency: true } },
        account: { select: { accountNumber: true, accountName: true, bankName: true } },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true, type: true, amount: true, status: true,
            reference: true, description: true, createdAt: true,
          },
        },
      },
    });
    return success(res, { user });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/wallet/deposit/paystack ────────────────────────
const initiatePaystackDeposit = async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 100) return error(res, 'Minimum deposit is ₦100.', 400);

    const reference = generateReference('DEP');
    await prisma.transaction.create({
      data: {
        userId: req.user.id, type: 'DEPOSIT', amount,
        status: 'PENDING', reference,
        description: 'Paystack deposit',
        meta: { provider: 'paystack' },
      },
    });

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: req.user.email,
        amount: Math.round(amount * 100),
        reference,
        callback_url: process.env.PAYSTACK_CALLBACK_URL,
        metadata: { userId: req.user.id },
      },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    return success(res, {
      reference,
      authorization_url: response.data.data.authorization_url,
      access_code: response.data.data.access_code,
    }, 'Payment initialized.');
  } catch (err) {
    next(err);
  }
};

// ── POST /api/wallet/deposit/flutterwave ──────────────────────
const initiateFlutterwaveDeposit = async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 100) return error(res, 'Minimum deposit is ₦100.', 400);

    const reference = generateReference('DEP');
    await prisma.transaction.create({
      data: {
        userId: req.user.id, type: 'DEPOSIT', amount,
        status: 'PENDING', reference,
        description: 'Flutterwave deposit',
        meta: { provider: 'flutterwave' },
      },
    });

    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      {
        tx_ref: reference, amount, currency: 'NGN',
        redirect_url: process.env.FLUTTERWAVE_CALLBACK_URL,
        customer: { email: req.user.email, name: req.user.fullname, phonenumber: req.user.phone },
        customizations: { title: process.env.APP_NAME || 'FintechWallet' },
      },
      { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` } }
    );

    return success(res, {
      reference,
      payment_link: response.data.data?.link,
    }, 'Payment initialized.');
  } catch (err) {
    next(err);
  }
};

// ── GET /api/wallet/deposit/verify/:reference ─────────────────
const verifyPayment = async (req, res, next) => {
  try {
    const { reference } = req.params;
    const txn = await prisma.transaction.findUnique({ where: { reference } });
    if (!txn) return error(res, 'Transaction not found.', 404);
    if (txn.userId !== req.user.id) return error(res, 'Unauthorized.', 403);
    if (txn.status === 'SUCCESS') {
      const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
      return success(res, { status: 'success', amount: txn.amount, new_balance: wallet.balance, reference });
    }

    const meta     = txn.meta || {};
    const provider = meta.provider || 'paystack';
    let verified   = false;
    let paidAmount = parseFloat(txn.amount);

    if (provider === 'paystack') {
      try {
        const r = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
          headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        });
        if (r.data.data?.status === 'success') {
          verified   = true;
          paidAmount = r.data.data.amount / 100;
        }
      } catch {}
    } else if (provider === 'flutterwave') {
      const txId = req.query.transaction_id;
      if (txId) {
        try {
          const r = await axios.get(`https://api.flutterwave.com/v3/transactions/${txId}/verify`, {
            headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
          });
          if (r.data.data?.status === 'successful') {
            verified   = true;
            paidAmount = r.data.data.amount;
          }
        } catch {}
      }
    }

    if (verified) {
      await _creditWallet(reference, txn.userId, paidAmount);
      const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
      return success(res, { status: 'success', amount: paidAmount, new_balance: wallet.balance, reference });
    }

    return success(res, { status: 'pending', reference }, 'Payment not confirmed yet. Wallet will be credited automatically.');
  } catch (err) {
    next(err);
  }
};

// ── Internal: credit wallet ───────────────────────────────────
const _creditWallet = async (reference, userId, amount) => {
  const txn = await prisma.transaction.findUnique({ where: { reference } });
  if (!txn || txn.status === 'SUCCESS') return;

  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { balance: { increment: amount } },
    }),
    prisma.transaction.update({
      where: { reference },
      data: { status: 'SUCCESS' },
    }),
  ]);

  const [wallet, user] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  EmailService.sendTransactionAlert(user, { type: 'DEPOSIT', amount, balance: wallet.balance, reference }).catch(() => {});
};

// ── POST /api/wallet/transfer/internal ───────────────────────
const internalTransfer = async (req, res, next) => {
  try {
    const { recipientAccountNumber, amount, description } = req.body;
    const parsedAmount = parseFloat(amount);
    if (!recipientAccountNumber || !parsedAmount || parsedAmount < 1) {
      return error(res, 'Account number and amount are required.', 400);
    }

    const recipient = await prisma.bankAccount.findUnique({
      where: { accountNumber: recipientAccountNumber },
      include: { user: true },
    });
    if (!recipient) return error(res, 'Recipient account not found.', 404);
    if (recipient.userId === req.user.id) return error(res, 'You cannot transfer to yourself.', 400);

    const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (parseFloat(senderWallet.balance) < parsedAmount) {
      return error(res, 'Insufficient wallet balance.', 400);
    }

    const reference = generateReference('TRF');

    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: req.user.id }, data: { balance: { decrement: parsedAmount } } }),
      prisma.wallet.update({ where: { userId: recipient.userId }, data: { balance: { increment: parsedAmount } } }),
      prisma.transaction.create({
        data: {
          userId: req.user.id, type: 'TRANSFER_OUT', amount: parsedAmount,
          status: 'SUCCESS', reference,
          description: description || `Transfer to ${recipient.accountName}`,
          meta: { recipientId: recipient.userId, recipientAccount: recipientAccountNumber },
        },
      }),
      prisma.transaction.create({
        data: {
          userId: recipient.userId, type: 'TRANSFER_IN', amount: parsedAmount,
          status: 'SUCCESS', reference: generateReference('TRF'),
          description: `Transfer from ${req.user.fullname}`,
          meta: { senderId: req.user.id },
        },
      }),
    ]);

    const newWallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });

    return success(res, {
      reference,
      new_balance: newWallet.balance,
      recipient: { name: recipient.accountName, accountNumber: recipientAccountNumber },
    }, `₦${parsedAmount.toLocaleString('en-NG')} sent to ${recipient.accountName}.`);
  } catch (err) {
    next(err);
  }
};

// ── POST /api/wallet/transfer/external ───────────────────────
const externalTransfer = async (req, res, next) => {
  try {
    const { bankCode, accountNumber, accountName, amount, description } = req.body;
    const parsedAmount = parseFloat(amount);

    const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (parseFloat(senderWallet.balance) < parsedAmount) {
      return error(res, 'Insufficient wallet balance.', 400);
    }

    const reference = generateReference('EXT');
    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: req.user.id }, data: { balance: { decrement: parsedAmount } } }),
      prisma.transaction.create({
        data: {
          userId: req.user.id, type: 'TRANSFER_OUT', amount: parsedAmount,
          status: 'SUCCESS', reference,
          description: description || `External transfer to ${accountName}`,
          meta: { bankCode, accountNumber, accountName, provider: 'simulated' },
        },
      }),
    ]);

    const newWallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    return success(res, { reference, new_balance: newWallet.balance }, `Transfer to ${accountName} initiated.`);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/wallet/transfer/lookup ──────────────────────────
const lookupAccount = async (req, res, next) => {
  try {
    const { account } = req.query;
    if (!account) return error(res, 'Account number required.', 400);
    const acct = await prisma.bankAccount.findUnique({
      where: { accountNumber: account },
      select: { accountNumber: true, accountName: true, bankName: true },
    });
    if (!acct) return error(res, 'Account not found.', 404);
    return success(res, { account: acct });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/wallet/airtime ──────────────────────────────────
const buyAirtime = async (req, res, next) => {
  try {
    const { network, phone, amount } = req.body;
    if (!network || !phone || !amount || amount < 50) {
      return error(res, 'Network, phone, and minimum ₦50 amount are required.', 400);
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (parseFloat(wallet.balance) < parseFloat(amount)) {
      return error(res, 'Insufficient wallet balance.', 400);
    }

    const reference = generateReference('AIR');
    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: req.user.id }, data: { balance: { decrement: parseFloat(amount) } } }),
      prisma.transaction.create({
        data: {
          userId: req.user.id, type: 'AIRTIME', amount: parseFloat(amount),
          status: 'SUCCESS', reference,
          description: `${network} airtime for ${phone}`,
          meta: { network, phone, provider: 'simulated' },
        },
      }),
    ]);

    const newWallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    return success(res, {
      reference, network, phone,
      amount, new_balance: newWallet.balance,
    }, `₦${amount} ${network} airtime purchased for ${phone}.`);
  } catch (err) {
    next(err);
  }
};

// ── POST /api/wallet/data ─────────────────────────────────────
const buyData = async (req, res, next) => {
  try {
    const { network, phone, plan, amount } = req.body;
    if (!network || !phone || !plan || !amount) {
      return error(res, 'Network, phone, plan, and amount are required.', 400);
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (parseFloat(wallet.balance) < parseFloat(amount)) {
      return error(res, 'Insufficient wallet balance.', 400);
    }

    const reference = generateReference('DAT');
    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: req.user.id }, data: { balance: { decrement: parseFloat(amount) } } }),
      prisma.transaction.create({
        data: {
          userId: req.user.id, type: 'DATA', amount: parseFloat(amount),
          status: 'SUCCESS', reference,
          description: `${network} ${plan} data for ${phone}`,
          meta: { network, phone, plan, provider: 'simulated' },
        },
      }),
    ]);

    const newWallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    return success(res, {
      reference, network, phone, plan,
      amount, new_balance: newWallet.balance,
    }, `${plan} ${network} data purchased for ${phone}.`);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/wallet/transactions ──────────────────────────────
const getTransactions = async (req, res, next) => {
  try {
    const page   = parseInt(req.query.page)   || 1;
    const limit  = parseInt(req.query.limit)  || 20;
    const type   = req.query.type?.toUpperCase();
    const status = req.query.status?.toUpperCase();
    const search = req.query.search;

    const where = {
      userId: req.user.id,
      ...(type   && { type }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { description: { contains: search } },
          { reference:   { contains: search } },
        ],
      }),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return success(res, {
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ── Paystack webhook ──────────────────────────────────────────
const paystackWebhook = async (req, res, next) => {
  try {
    const crypto    = require('crypto');
    const signature = req.headers['x-paystack-signature'];
    const hash      = crypto.createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET)
      .update(JSON.stringify(req.body)).digest('hex');

    if (hash !== signature) return res.sendStatus(401);
    res.sendStatus(200);

    const event = req.body;
    if (event.event === 'charge.success') {
      const txn = await prisma.transaction.findUnique({ where: { reference: event.data.reference } });
      if (txn) await _creditWallet(event.data.reference, txn.userId, event.data.amount / 100);
    }
  } catch (err) {
    next(err);
  }
};

// ── Flutterwave webhook ───────────────────────────────────────
const flutterwaveWebhook = async (req, res, next) => {
  try {
    const hash = req.headers['verif-hash'];
    if (hash !== process.env.FLUTTERWAVE_WEBHOOK_HASH) return res.sendStatus(401);
    res.sendStatus(200);

    const event = req.body;
    if (event.event === 'charge.completed' && event.data.status === 'successful') {
      const txn = await prisma.transaction.findUnique({ where: { reference: event.data.tx_ref } });
      if (txn) await _creditWallet(event.data.tx_ref, txn.userId, event.data.amount);
    }
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboard, initiatePaystackDeposit, initiateFlutterwaveDeposit,
  verifyPayment, internalTransfer, externalTransfer, lookupAccount,
  buyAirtime, buyData, getTransactions,
  paystackWebhook, flutterwaveWebhook,
};
