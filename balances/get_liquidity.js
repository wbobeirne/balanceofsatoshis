const asyncAuto = require('async/auto');
const {authenticatedLndGrpc} = require('ln-service');
const {getChannels} = require('ln-service');
const {percentile} = require('stats-lite');
const {returnResult} = require('asyncjs-util');

const balanceFromTokens = require('./balance_from_tokens');
const {lndCredentials} = require('./../lnd');

const {round} = Math;
const topPercentile = 0.9;

/** Get the channel available liquidity

  {
    [above]: <Tokens Above Tokens Number>
    [below]: <Tokens Below Tokens Number>
    [is_outbound]: <Return Outbound Liquidity Bool>
    [is_top]: <Return Top Liquidity Bool>
    [node]: <Node Name String>
    [with]: <Liquidity With Specific Node Public Key Hex String>
  }

  @returns via cbk
  {
    balance: <Liquid Tokens Number>
  }
*/
module.exports = (args, cbk) => {
  return asyncAuto({
    // Credentials
    credentials: cbk => lndCredentials({node: args.node}, cbk),

    // Lnd
    lnd: ['credentials', ({credentials}, cbk) => {
      return cbk(null, authenticatedLndGrpc({
        cert: credentials.cert,
        macaroon: credentials.macaroon,
        socket: credentials.socket,
      }).lnd);
    }],

    // Get the channels
    getChannels: ['lnd', ({lnd}, cbk) => getChannels({lnd}, cbk)],

    // List of tokens to sum
    tokens: ['getChannels', ({getChannels}, cbk) => {
      const activeChannels = getChannels.channels
        .filter(n => !!n.is_active)
        .filter(n => !args.with || n.partner_public_key === args.with);

      const balanceType = !!args.is_outbound ? 'local' : 'remote';

      const tokens = activeChannels.map(n => n[`${balanceType}_balance`]);

      if (!!args.is_top) {
        return cbk(null, [round(percentile(tokens, topPercentile))]);
      }

      return cbk(null, tokens);
    }],

    // Total balances
    total: ['tokens', ({tokens}, cbk) => {
      const {above} = args;
      const {below} = args;

      try {
        const balance = balanceFromTokens({above, below, tokens});

        return cbk(null, balance);
      } catch (err) {
        return cbk([500, 'FailedToCalculateLiquidityBalance', err]);
      }
    }],

    // Liquidity
    liquidity: ['total', ({total}, cbk) => {
      return cbk(null, {balance: total});
    }],
  },
  returnResult({of: 'liquidity'}, cbk));
};
