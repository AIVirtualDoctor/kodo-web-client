import BigNumber from 'bignumber.js'
import * as moment from 'moment'
import { v4 as uuidv4 } from 'uuid'

import stores from '.'
import { formatAddress, formatCurrency } from '../utils'
import { ACTIONS, CONTRACTS, MAX_UINT256, ZERO_ADDRESS } from './constants'

class Store {
  constructor(dispatcher, emitter) {
    this.dispatcher = dispatcher
    this.emitter = emitter

    this.store = {
      baseAssets: [],
      assets: [],
      govToken: null,
      veToken: null,
      pairs: [],
      vestNFTs: [],
      rewards: {
        bribes: [],
        fees: [],
        rewards: [],
        veDist: [],
      },
      rewardsAll: {
        fees: [], // LP fee
        rewards: [], // KODO emission
        nftRewards: [], // bribes + KODO rebase
      },
      veStartTime: null,
      // airdropInfo: null,
    }

    dispatcher.register(
      function (payload) {
        switch (payload.type) {
          case ACTIONS.CONFIGURE_SS:
            this.configure(payload)
            break
          case ACTIONS.GET_BALANCES:
            this.getBalances(payload)
            break
          case ACTIONS.SEARCH_ASSET:
            this.searchBaseAsset(payload)
            break

          // LIQUIDITY
          // case ACTIONS.CREATE_PAIR_AND_STAKE:
          //   this.createPairStake(payload)
          //   break
          case ACTIONS.CREATE_PAIR_AND_DEPOSIT:
            this.createPairDeposit(payload)
            break
          case ACTIONS.ADD_LIQUIDITY:
            this.addLiquidity(payload)
            break
          case ACTIONS.STAKE_LIQUIDITY:
            this.stakeLiquidityWithAmount(payload) // this.stakeLiquidity(payload)
            break
          // case ACTIONS.ADD_LIQUIDITY_AND_STAKE:
          //   this.addLiquidityAndStake(payload)
          //   break
          case ACTIONS.QUOTE_ADD_LIQUIDITY:
            this.quoteAddLiquidity(payload)
            break
          case ACTIONS.GET_LIQUIDITY_BALANCES:
            this.getLiquidityBalances(payload)
            break
          case ACTIONS.REMOVE_LIQUIDITY:
            this.removeLiquidityWithAmount(payload) // this.removeLiquidity(payload)
            break
          // case ACTIONS.UNSTAKE_AND_REMOVE_LIQUIDITY:
          //   this.unstakeAndRemoveLiquidity(payload)
          //   break
          case ACTIONS.QUOTE_REMOVE_LIQUIDITY:
            this.quoteRemoveLiquidity(payload)
            break
          case ACTIONS.UNSTAKE_LIQUIDITY:
            this.unstakeLiquidity(payload)
            break
          // case ACTIONS.CREATE_GAUGE:
          //   this.createGauge(payload)
          //   break

          // SWAP
          case ACTIONS.QUOTE_SWAP:
            this.quoteSwap(payload)
            break
          case ACTIONS.SWAP:
            this.swap(payload)
            break
          case ACTIONS.WRAP:
            this.wrap(payload)
            break

          // VESTING
          case ACTIONS.GET_VEST_NFTS:
            this.getVestNFTs(payload)
            break
          case ACTIONS.CREATE_VEST:
            this.createVest(payload)
            break
          case ACTIONS.INCREASE_VEST_AMOUNT:
            this.increaseVestAmount(payload)
            break
          case ACTIONS.INCREASE_VEST_DURATION:
            this.increaseVestDuration(payload)
            break
          case ACTIONS.MAX_VEST_DURATION:
            this.maxVestDuration(payload)
            break
          case ACTIONS.WITHDRAW_VEST:
            this.withdrawVest(payload)
            break
          case ACTIONS.MERGE_VEST:
            this.mergeVest(payload)
            break
          case ACTIONS.TRANSFER_VEST:
            this.transferVest(payload)
            break
          case ACTIONS.RESET_VEST:
            this.resetVest(payload)
            break
          case ACTIONS.POKE_VEST:
            this.pokeVest(payload)
            break

          //VOTE
          case ACTIONS.VOTE:
            this.vote(payload)
            break
          case ACTIONS.GET_VEST_VOTES:
            this.getVestVotes(payload)
            break
          case ACTIONS.GET_VEST_VOTES_ALL:
            this.getVestVotesAll(payload)
            break
          case ACTIONS.CREATE_BRIBE:
            this.createBribe(payload)
            break
          case ACTIONS.GET_VEST_BALANCES:
            this.getVestBalances(payload)
            break

          //REWARDS
          case ACTIONS.GET_REWARD_BALANCES:
            this.getRewardBalances(payload)
            break
          //REWARDS ALL
          case ACTIONS.GET_REWARD_BALANCES_ALL:
            this.getRewardBalancesALL(payload)
            break
          case ACTIONS.CLAIM_BRIBE:
            this.claimBribes(payload)
            break
          case ACTIONS.CLAIM_PAIR_FEES:
            this.claimPairFees(payload)
            break
          case ACTIONS.CLAIM_REWARD:
            this.claimRewards(payload)
            break
          case ACTIONS.CLAIM_VE_DIST:
            this.claimVeDist(payload)
            break
          case ACTIONS.CLAIM_ALL_REWARDS:
            this.claimAllRewards(payload)
            break

          //WHITELIST
          case ACTIONS.SEARCH_WHITELIST:
            this.searchWhitelist(payload)
            break
          case ACTIONS.WHITELIST_TOKEN:
            this.whitelistToken(payload)
            break

          // //AIRDROP
          // case ACTIONS.CLAIM_AIRDROP:
          //   this.claimAirdrop(payload)
          //   break
          default: {
          }
        }
      }.bind(this)
    )
  }

  getStore = (index) => {
    return this.store[index]
  }

  setStore = (obj) => {
    this.store = { ...this.store, ...obj }
    // console.log(this.store)
    return this.emitter.emit(ACTIONS.STORE_UPDATED)
  }

  // COMMON GETTER FUNCTIONS Assets, BaseAssets, Pairs etc
  getAsset = (address) => {
    const assets = this.store.assets
    if (!assets || assets.length === 0) {
      return null
    }

    let theAsset = assets.filter((ass) => {
      if (!ass) {
        return false
      }
      return ass.address.toLowerCase() === address.toLowerCase()
    })

    if (!theAsset || theAsset.length === 0) {
      return null
    }

    return theAsset[0]
  }

  getNFTByID = async (id) => {
    try {
      const vestNFTs = this.getStore('vestNFTs')
      let theNFT = vestNFTs.filter((vestNFT) => {
        return vestNFT.id == id
      })

      if (theNFT.length > 0) {
        return theNFT[0]
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const veToken = this.getStore('veToken')
      const govToken = this.getStore('govToken')

      const vestingContract = new web3.eth.Contract(CONTRACTS.VE_TOKEN_ABI, CONTRACTS.VE_TOKEN_ADDRESS)

      const nftsLength = await vestingContract.methods.balanceOf(account.address).call()
      const arr = Array.from({ length: parseInt(nftsLength) }, (v, i) => i)

      const nfts = await Promise.all(
        arr.map(async (idx) => {
          const tokenIndex = await vestingContract.methods.tokenOfOwnerByIndex(account.address, idx).call()
          const locked = await vestingContract.methods.locked(tokenIndex).call()
          const lockValue = await vestingContract.methods.balanceOfNFT(tokenIndex).call()

          // probably do some decimals math before returning info. Maybe get more info. I don't know what it returns.
          return {
            id: tokenIndex,
            lockEnds: locked.end,
            lockAmount: BigNumber(locked.amount)
              .div(10 ** govToken.decimals)
              .toFixed(govToken.decimals),
            lockValue: BigNumber(lockValue)
              .div(10 ** veToken.decimals)
              .toFixed(veToken.decimals),
          }
        })
      )

      this.setStore({ vestNFTs: nfts })

      theNFT = nfts.filter((nft) => {
        return nft.id == id
      })

      if (theNFT.length > 0) {
        return theNFT[0]
      }

      return null
    } catch (ex) {
      console.log(ex)
      return null
    }
  }

  _updateVestNFTByID = async (id) => {
    try {
      const vestNFTs = this.getStore('vestNFTs')
      let theNFT = vestNFTs.filter((vestNFT) => {
        return vestNFT.id == id
      })

      if (theNFT.length == 0) {
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const veToken = this.getStore('veToken')
      const govToken = this.getStore('govToken')

      const vestingContract = new web3.eth.Contract(CONTRACTS.VE_TOKEN_ABI, CONTRACTS.VE_TOKEN_ADDRESS)

      const locked = await vestingContract.methods.locked(id).call()
      const lockValue = await vestingContract.methods.balanceOfNFT(id).call()

      const newVestNFTs = vestNFTs.map((nft) => {
        if (nft.id == id) {
          return {
            id,
            lockEnds: locked.end,
            lockAmount: BigNumber(locked.amount)
              .div(10 ** govToken.decimals)
              .toFixed(govToken.decimals),
            lockValue: BigNumber(lockValue)
              .div(10 ** veToken.decimals)
              .toFixed(veToken.decimals),
          }
        }

        return nft
      })

      this.setStore({ vestNFTs: newVestNFTs })
      this.emitter.emit(ACTIONS.UPDATED)
      return null
    } catch (ex) {
      console.log(ex)
      return null
    }
  }

  _removeVestNFTByID = async (id) => {
    try {
      const vestNFTs = this.getStore('vestNFTs')
      const newVestNFTs = vestNFTs.filter((nft) => nft.id !== id)
      this.setStore({ vestNFTs: newVestNFTs })
      this.emitter.emit(ACTIONS.UPDATED)
      return null
    } catch (ex) {
      console.log(ex)
      return null
    }
  }

  getPairByAddress = async (pairAddress) => {
    try {
      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const pairs = this.getStore('pairs')
      let thePair = pairs.filter((pair) => {
        return pair.address.toLowerCase() == pairAddress.toLowerCase()
      })

      if (thePair.length > 0) {
        const pc = new web3.eth.Contract(CONTRACTS.PAIR_ABI, pairAddress)

        const [totalSupply, reserve0, reserve1, balanceOf] = await Promise.all([
          pc.methods.totalSupply().call(),
          pc.methods.reserve0().call(),
          pc.methods.reserve1().call(),
          pc.methods.balanceOf(account.address).call(),
        ])

        const returnPair = thePair[0]
        returnPair.balance = BigNumber(balanceOf)
          .div(10 ** returnPair.decimals)
          .toFixed(parseInt(returnPair.decimals))
        returnPair.totalSupply = BigNumber(totalSupply)
          .div(10 ** returnPair.decimals)
          .toFixed(parseInt(returnPair.decimals))
        returnPair.reserve0 = BigNumber(reserve0)
          .div(10 ** returnPair.token0.decimals)
          .toFixed(parseInt(returnPair.token0.decimals))
        returnPair.reserve1 = BigNumber(reserve1)
          .div(10 ** returnPair.token1.decimals)
          .toFixed(parseInt(returnPair.token1.decimals))

        return returnPair
      }

      const factoryContract = new web3.eth.Contract(CONTRACTS.FACTORY_ABI, CONTRACTS.FACTORY_ADDRESS)
      const isValidPair = await factoryContract.methods.isPair(pairAddress).call()

      if (isValidPair) {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API}/api/v1/updatePairs?pair_address=${pairAddress}`, {
          method: 'get',
          // headers: {
          //   Authorization: `Basic ${process.env.NEXT_PUBLIC_API_TOKEN}`,
          // },
        })
        const pairsCall = await response.json()

        let thePair = pairsCall.data?.filter((pair) => {
          return pair.address.toLowerCase() == pairAddress.toLowerCase()
        })

        if (thePair.length == 0) {
          return null
        }

        thePair = thePair[0]
        thePair = await this._processPair(web3, account, thePair)

        const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)
        const [totalWeight] = await Promise.all([gaugesContract.methods.totalWeight().call()])
        thePair = await this._processGauge(web3, account, thePair, gaugesContract, totalWeight)

        pairs.push(thePair)
        this.setStore({ pairs })

        return thePair
      }

      return null
    } catch (ex) {
      console.log(ex)
      return null
    }
  }

  getPair = async (addressA, addressB, stab) => {
    try {
      if (addressA === 'ETH') {
        addressA = CONTRACTS.WETH_ADDRESS
      }
      if (addressB === 'ETH') {
        addressB = CONTRACTS.WETH_ADDRESS
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const pairs = this.getStore('pairs')
      let thePair = pairs.filter((pair) => {
        return (
          (pair.token0.address.toLowerCase() == addressA.toLowerCase() &&
            pair.token1.address.toLowerCase() == addressB.toLowerCase() &&
            pair.isStable == stab) ||
          (pair.token0.address.toLowerCase() == addressB.toLowerCase() &&
            pair.token1.address.toLowerCase() == addressA.toLowerCase() &&
            pair.isStable == stab)
        )
      })
      if (thePair.length > 0) {
        const pc = new web3.eth.Contract(CONTRACTS.PAIR_ABI, thePair[0].address)

        const [totalSupply, reserve0, reserve1, balanceOf] = await Promise.all([
          pc.methods.totalSupply().call(),
          pc.methods.reserve0().call(),
          pc.methods.reserve1().call(),
          pc.methods.balanceOf(account.address).call(),
        ])

        const returnPair = thePair[0]
        returnPair.balance = BigNumber(balanceOf)
          .div(10 ** returnPair.decimals)
          .toFixed(parseInt(returnPair.decimals))
        returnPair.totalSupply = BigNumber(totalSupply)
          .div(10 ** returnPair.decimals)
          .toFixed(parseInt(returnPair.decimals))
        returnPair.reserve0 = BigNumber(reserve0)
          .div(10 ** returnPair.token0.decimals)
          .toFixed(parseInt(returnPair.token0.decimals))
        returnPair.reserve1 = BigNumber(reserve1)
          .div(10 ** returnPair.token1.decimals)
          .toFixed(parseInt(returnPair.token1.decimals))

        return returnPair
      }

      const factoryContract = new web3.eth.Contract(CONTRACTS.FACTORY_ABI, CONTRACTS.FACTORY_ADDRESS)
      const pairAddress = await factoryContract.methods.getPair(addressA, addressB, stab).call()

      if (pairAddress && pairAddress != ZERO_ADDRESS) {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API}/api/v1/updatePairs?pair_address=${pairAddress}`, {
          method: 'get',
          // headers: {
          //   Authorization: `Basic ${process.env.NEXT_PUBLIC_API_TOKEN}`,
          // },
        })
        const pairsCall = await response.json()

        let thePair = pairsCall.data.filter((pair) => {
          return pair.address.toLowerCase() == pairAddress.toLowerCase()
        })

        if (thePair.length == 0) {
          return null
        }

        thePair = thePair[0]
        thePair = await this._processPair(web3, account, thePair)

        const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)
        const [totalWeight] = await Promise.all([gaugesContract.methods.totalWeight().call()])
        thePair = await this._processGauge(web3, account, thePair, gaugesContract, totalWeight)

        pairs.push(thePair)
        this.setStore({ pairs })

        return thePair
      }

      return null
    } catch (ex) {
      console.log(ex)
      return null
    }
  }

  removeBaseAsset = (asset) => {
    try {
      let localBaseAssets = []
      const localBaseAssetsString = localStorage.getItem('stableSwap-assets')

      if (localBaseAssetsString && localBaseAssetsString !== '') {
        localBaseAssets = JSON.parse(localBaseAssetsString)

        localBaseAssets = localBaseAssets.filter(function (obj) {
          return obj.address.toLowerCase() !== asset.address.toLowerCase()
        })

        localStorage.setItem('stableSwap-assets', JSON.stringify(localBaseAssets))

        let baseAssets = this.getStore('baseAssets')
        baseAssets = baseAssets.filter(function (obj) {
          return obj.address.toLowerCase() !== asset.address.toLowerCase() && asset.local === true
        })

        this.setStore({ baseAssets })
        this.emitter.emit(ACTIONS.BASE_ASSETS_UPDATED, baseAssets)
      }
    } catch (ex) {
      console.log(ex)
      return null
    }
  }

  getLocalAssets = () => {
    try {
      let localBaseAssets = []
      const localBaseAssetsString = localStorage.getItem('stableSwap-assets')

      if (localBaseAssetsString && localBaseAssetsString !== '') {
        localBaseAssets = JSON.parse(localBaseAssetsString)
      }

      return localBaseAssets
    } catch (ex) {
      console.log(ex)
      return []
    }
  }

  getBaseAsset = async (address, save, getBalance) => {
    try {
      const baseAssets = this.getStore('baseAssets')

      const theBaseAsset = baseAssets.filter((as) => {
        return as.address.toLowerCase() === address.toLowerCase()
      })
      if (theBaseAsset.length > 0) {
        return theBaseAsset[0]
      }

      // not found, so we search the blockchain for it.
      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const account = stores.accountStore.getStore('account')

      const [symbol, decimals, name, balanceOf] = await this._tryGetBaseAssetDetails(web3, address, getBalance, account)

      const newBaseAsset = {
        address,
        symbol,
        name,
        decimals: parseInt(decimals),
        logoURI: null,
        local: true,
        balance: balanceOf
          ? BigNumber(balanceOf)
              .div(10 ** decimals)
              .toFixed(parseInt(decimals))
          : '0',
      }

      //only save when a user adds it. don't for when we lookup a pair and find the asset.
      if (save) {
        let localBaseAssets = this.getLocalAssets()
        localBaseAssets = [...localBaseAssets, newBaseAsset]
        localStorage.setItem('stableSwap-assets', JSON.stringify(localBaseAssets))

        const baseAssets = this.getStore('baseAssets')
        const storeBaseAssets = [...baseAssets, newBaseAsset]

        this.setStore({ baseAssets: storeBaseAssets })
        this.emitter.emit(ACTIONS.BASE_ASSETS_UPDATED, storeBaseAssets)
      }

      return newBaseAsset
    } catch (ex) {
      console.log(ex)
      // this.emitter.emit(ACTIONS.ERROR, ex)
      return null
    }
  }

  _tryGetBaseAssetDetails = async (web3, address, getBalance, account) => {
    try {
      const multicall = await stores.accountStore.getMulticall()
      const baseAssetDetails = await this._getBaseAssetDetails(web3, multicall, address, getBalance, account)
      return baseAssetDetails
    } catch (ex) {
      try {
        const multicall = await stores.accountStore.getMulticall(true)
        const baseAssetDetails = await this._getBaseAssetDetails(web3, multicall, address, getBalance, account)
        return baseAssetDetails
      } catch (ex) {
        throw ex
      }
    }
  }

  _getBaseAssetDetails = async (web3, multicall, address, getBalance, account) => {
    try {
      const baseAssetContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, address)
      const calls = [
        baseAssetContract.methods.symbol(),
        baseAssetContract.methods.decimals(),
        baseAssetContract.methods.name(),
      ]

      if (getBalance) {
        calls.push(baseAssetContract.methods.balanceOf(account.address))
      }

      return multicall.aggregate(calls)
    } catch (ex) {
      console.log(ex)
      throw ex
    }
  }

  // DISPATCHER FUNCTIONS
  // by DrumMaster
  configure = async (payload) => {
    try {
      this.setStore({ govToken: this._getGovTokenBase() })
      this.setStore({ veToken: this._getVeTokenBase() })
      this.setStore({ baseAssets: await this._getBaseAssets() })
      this.setStore({ routeAssets: await this._getRouteAssets() })
      this.setStore({ pairs: await this._getPairs() })

      this.emitter.emit(ACTIONS.UPDATED)
      this.emitter.emit(ACTIONS.CONFIGURED_SS)

      setTimeout(() => {
        this.dispatcher.dispatch({ type: ACTIONS.GET_BALANCES })
      }, 1)
    } catch (ex) {
      console.log(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  _getBaseAssets = async () => {
    try {
      console.log('=== Fetching baseAssets from:', `${process.env.NEXT_PUBLIC_API}/api/v1/baseAssets`)
      const response = await fetch(`${process.env.NEXT_PUBLIC_API}/api/v1/baseAssets`, {
        method: 'get',
        // headers: {
        //   Authorization: `Basic ${process.env.NEXT_PUBLIC_API_TOKEN}`,
        // },
      })
      console.log('API response status:', response.status)
      const baseAssetsCall = await response.json()
      console.log('Base assets API response:', baseAssetsCall)

      // const baseAssetsCall = baseAssetsData // TODO: remove this line

      let baseAssets = baseAssetsCall.data

      const nativeETH = {
        address: CONTRACTS.ETH_ADDRESS,
        decimals: CONTRACTS.ETH_DECIMALS,
        logoURI: CONTRACTS.ETH_LOGO,
        name: CONTRACTS.ETH_NAME,
        symbol: CONTRACTS.ETH_SYMBOL,
      }

      let wethAsset = baseAssets.filter((asset) => {
        return asset.address.toLowerCase() === CONTRACTS.WETH_ADDRESS.toLowerCase()
      })

      if (wethAsset.length > 0) {
        nativeETH.price = wethAsset[0].price
      }

      baseAssets.unshift(nativeETH)

      let localBaseAssets = this.getLocalAssets()

      return [...baseAssets, ...localBaseAssets]
    } catch (ex) {
      console.log(ex)
      return []
    }
  }

  _getRouteAssets = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API}/api/v1/routeAssets`, {
        method: 'get',
        // headers: {
        //   Authorization: `Basic ${process.env.NEXT_PUBLIC_API_TOKEN}`,
        // },
      })
      const routeAssetsCall = await response.json()
      // const routeAssetsCall = routeAssetsData // TODO: remove this line
      return routeAssetsCall.data
    } catch (ex) {
      console.log(ex)
      return []
    }
  }

  _getPairs = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API}/api/v1/pairs`, {
        method: 'get',
        // headers: {
        //   Authorization: `Basic ${process.env.NEXT_PUBLIC_API_TOKEN}`,
        // },
      })
      const pairsCall = await response.json()
      // const pairsCall = pairsData // TODO: remove this line
      return pairsCall.data
    } catch (ex) {
      console.log(ex)
      return []
    }
  }

  _getGovTokenBase = () => {
    return {
      address: CONTRACTS.GOV_TOKEN_ADDRESS,
      name: CONTRACTS.GOV_TOKEN_NAME,
      symbol: CONTRACTS.GOV_TOKEN_SYMBOL,
      decimals: CONTRACTS.GOV_TOKEN_DECIMALS,
      logoURI: CONTRACTS.GOV_TOKEN_LOGO,
    }
  }

  _getVeTokenBase = () => {
    return {
      address: CONTRACTS.VE_TOKEN_ADDRESS,
      name: CONTRACTS.VE_TOKEN_NAME,
      symbol: CONTRACTS.VE_TOKEN_SYMBOL,
      decimals: CONTRACTS.VE_TOKEN_DECIMALS,
      logoURI: CONTRACTS.VE_TOKEN_LOGO,
    }
  }

  // Get account-wise info:
  // - GovToken balance
  // - Vesting NFTs info
  // - Pair info
  // - BaseAsset info
  getBalances = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      console.log('=== getBalances START ===', account)
      // if (!account) {
      //   console.warn('account not found')
      //   return null
      // }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }
      console.log('web3 provider obtained:', web3)

      if (account && account.address) {
        console.log('Fetching gov token info for:', account.address)
        this._getGovTokenInfo(web3, account)
      }
      console.log('Fetching base asset info...')
      await this._getBaseAssetInfo(web3, account)
      console.log('Fetching pairs info...')
      await this._getPairsInfo(web3, account)
    } catch (ex) {
      console.log(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  _getVestNFTs = async (web3, account) => {
    try {
      const veToken = this.getStore('veToken')
      const govToken = this.getStore('govToken')

      const vestingContract = new web3.eth.Contract(CONTRACTS.VE_TOKEN_ABI, CONTRACTS.VE_TOKEN_ADDRESS)

      const nftsLength = await vestingContract.methods.balanceOf(account.address).call()
      const arr = Array.from({ length: parseInt(nftsLength) }, (v, i) => i)

      const nfts = await Promise.all(
        arr.map(async (idx) => {
          const tokenIndex = await vestingContract.methods.tokenOfOwnerByIndex(account.address, idx).call()
          const locked = await vestingContract.methods.locked(tokenIndex).call()
          const lockValue = await vestingContract.methods.balanceOfNFT(tokenIndex).call()

          // probably do some decimals math before returning info. Maybe get more info. I don't know what it returns.
          return {
            id: tokenIndex,
            lockEnds: locked.end,
            lockAmount: BigNumber(locked.amount)
              .div(10 ** govToken.decimals)
              .toFixed(govToken.decimals),
            lockValue: BigNumber(lockValue)
              .div(10 ** veToken.decimals)
              .toFixed(veToken.decimals),
          }
        })
      )

      this.setStore({ vestNFTs: nfts })
      this.emitter.emit(ACTIONS.UPDATED)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  _getGovTokenInfo = async (web3, account) => {
    try {
      const govToken = this.getStore('govToken')
      if (!govToken) {
        console.warn('govToken not found')
        return null
      }

      const veTokenContract = new web3.eth.Contract(CONTRACTS.GOV_TOKEN_ABI, CONTRACTS.GOV_TOKEN_ADDRESS)

      const [balanceOf] = await Promise.all([veTokenContract.methods.balanceOf(account.address).call()])

      govToken.balanceOf = balanceOf
      govToken.balance = BigNumber(balanceOf)
        .div(10 ** govToken.decimals)
        .toFixed(govToken.decimals)

      this.setStore({ govToken })
      this.emitter.emit(ACTIONS.UPDATED)

      this._getVestNFTs(web3, account)
    } catch (ex) {
      console.log(ex)
    }
  }

  // Wrapper of _getPairsInfo()
  // Always get the latest pair info from the API
  getPairsInfo = async (web3, account) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API}/api/v1/updatePairs`, {
        method: 'get',
        // headers: {
        //   Authorization: `Basic ${process.env.NEXT_PUBLIC_API_TOKEN}`,
        // },
      })
      const pairsCall = await response.json()
      await this._getPairsInfo(web3, account, pairsCall.data)
    } catch (ex) {
      console.log(ex)
    }
  }

  // Add account-wise info for pairs.(espacially balance info)
  _getPairsInfo = async (web3, account, overridePairs) => {
    try {
      const start = moment()

      let pairs = []

      if (overridePairs) {
        pairs = overridePairs
      } else {
        pairs = this.getStore('pairs')
      }

      const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)

      const [totalWeight] = await Promise.all([gaugesContract.methods.totalWeight().call()])

      const ps = await Promise.all(
        pairs.map(async (pair) => {
          try {
            return await this._processPair(web3, account, pair)
          } catch (ex) {
            console.log('EXCEPTION 1')
            console.log(pair)
            console.log(ex)
            return pair
          }
        })
      )

      this.setStore({ pairs: ps })
      this.emitter.emit(ACTIONS.UPDATED)

      const ps1 = await Promise.all(
        ps.map(async (pair) => {
          try {
            return await this._processGauge(web3, account, pair, gaugesContract, totalWeight)
          } catch (ex) {
            console.log('EXCEPTION 2')
            console.log(pair)
            console.log(ex)
            return pair
          }
        })
      )

      const end = moment()
      const time = end.diff(start)
      console.log(`_getPairsInfo took ${time} MS`)

      this.setStore({ pairs: ps1 })
      this.emitter.emit(ACTIONS.UPDATED)
    } catch (ex) {
      console.log(ex)
    }
  }

  // Convinience function to add additional info to pair(espacially balance info)
  _processPair = async (web3, account, pair) => {
    const token0 = await this.getBaseAsset(pair.token0.address, false, true)
    const token1 = await this.getBaseAsset(pair.token1.address, false, true)

    const [totalSupply, reserves, balanceOf, claimable0, claimable1] = await this._tryGetPairBalances(
      web3,
      pair,
      account
    )

    pair.token0 = token0 != null ? token0 : pair.token0
    pair.token1 = token1 != null ? token1 : pair.token1
    pair.balance = BigNumber(balanceOf)
      .div(10 ** pair.decimals)
      .toFixed(parseInt(pair.decimals))
    pair.totalSupply = BigNumber(totalSupply)
      .div(10 ** pair.decimals)
      .toFixed(parseInt(pair.decimals))
    pair.reserve0 = BigNumber(reserves[0])
      .div(10 ** pair.token0.decimals)
      .toFixed(parseInt(pair.token0.decimals))
    pair.reserve1 = BigNumber(reserves[1])
      .div(10 ** pair.token1.decimals)
      .toFixed(parseInt(pair.token1.decimals))
    pair.claimable0 = BigNumber(claimable0)
      .div(10 ** pair.token0.decimals)
      .toFixed(pair.token0.decimals)
    pair.claimable1 = BigNumber(claimable1)
      .div(10 ** pair.token1.decimals)
      .toFixed(pair.token1.decimals)
    // pair.tvl = BigNumber(pair.reserve0) // --
    //   .times(pair.token0.price || 0)
    //   .plus(BigNumber(pair.reserve1).times(pair.token1.price || 0))
    pair.myTvl = BigNumber(pair.balance).div(pair.totalSupply).times(pair.tvl) // no sense

    return pair
  }

  // Convinience function to add additional info to gauge(espacially balance info)
  _processGauge = async (web3, account, pair, gaugesContract, totalWeight) => {
    if (pair.gauge && pair.gauge.address !== ZERO_ADDRESS) {
      const [totalSupply, gaugeBalance, gaugeWeight] = await this._tryGetGaugeBalances(
        web3,
        pair,
        account,
        gaugesContract
      )

      // const bribeContract = new web3.eth.Contract(CONTRACTS.BRIBE_ABI, pair.gauge.bribeAddress)

      // const bribes = await Promise.all(
      //   pair.gauge.bribes.map(async (bribe, idx) => {
      //     const rewardRate = await bribeContract.methods.rewardRate(bribe.token.address).call()

      //     bribe.rewardRate = BigNumber(rewardRate)
      //       .div(10 ** bribe.token.decimals)
      //       .toFixed(bribe.token.decimals)
      //     bribe.rewardAmount = BigNumber(rewardRate)
      //       .times(604800)
      //       .div(10 ** bribe.token.decimals)
      //       .toFixed(bribe.token.decimals)

      //     return bribe
      //   })
      // )

      pair.gauge.balance = BigNumber(gaugeBalance)
        .div(10 ** 18)
        .toFixed(18)
      pair.gauge.totalSupply = BigNumber(totalSupply)
        .div(10 ** 18)
        .toFixed(18)
      pair.gauge.reserve0 =
        pair.totalSupply > 0
          ? BigNumber(pair.reserve0).times(pair.gauge.totalSupply).div(pair.totalSupply).toFixed(pair.token0.decimals)
          : '0'
      pair.gauge.reserve1 =
        pair.totalSupply > 0
          ? BigNumber(pair.reserve1).times(pair.gauge.totalSupply).div(pair.totalSupply).toFixed(pair.token1.decimals)
          : '0'
      pair.gauge.weight = BigNumber(gaugeWeight)
        .div(10 ** 18)
        .toFixed(18)
      pair.gauge.weightPercent = BigNumber(gaugeWeight).times(100).div(totalWeight).toFixed(2)
      // pair.gaugebribes = bribes
      // pair.gauge.tvl = BigNumber(pair.gauge.reserve0)
      //   .times(pair.token0.price || 0)
      //   .plus(BigNumber(pair.gauge.reserve1).times(pair.token1.price || 0))
      pair.gauge.myTvl = BigNumber(pair.gauge.balance).div(pair.totalSupply).times(pair.tvl)
      // total bribes value, by DrumMaster
      // pair.gauge.bribeValue = pair.gauge.bribes.reduce(
      //   (sum, bribe) => sum.plus(BigNumber(bribe.token.price).times(bribe.rewardAmount)),
      //   BigNumber(0)
      // )
      // expected income per vote, by DrumMaster
      pair.gauge.valuePerVote = !BigNumber(pair.gauge.weight).isEqualTo(0)
        ? BigNumber(pair.gauge.tbv).dividedBy(pair.gauge.weight)
        : BigNumber(pair.gauge.tbv)
    }

    return pair
  }

  _tryGetPairBalances = async (web3, pair, account) => {
    try {
      const multicall = await stores.accountStore.getMulticall()
      const pairBalances = await this._getPairBalances(web3, multicall, pair, account)
      return pairBalances
    } catch (ex) {
      try {
        const multicall = await stores.accountStore.getMulticall(true)
        const pairBalances = await this._getPairBalances(web3, multicall, pair, account)
        return pairBalances
      } catch (ex) {
        throw ex
      }
    }
  }

  _getPairBalances = async (web3, multicall, pair, account) => {
    try {
      const pairContract = new web3.eth.Contract(CONTRACTS.PAIR_ABI, pair.address)

      if (account && account.address) {
        return multicall.aggregate([
          pairContract.methods.totalSupply(),
          pairContract.methods.getReserves(),
          pairContract.methods.balanceOf(account.address),
          pairContract.methods.claimable0(account.address),
          pairContract.methods.claimable1(account.address),
        ])
      } else {
        const result = await multicall.aggregate([
          pairContract.methods.totalSupply(),
          pairContract.methods.getReserves(),
        ])

        return [...result, '0', '0', '0']
      }
    } catch (ex) {
      console.log(ex)
      throw ex
    }
  }

  _tryGetGaugeBalances = async (web3, pair, account, gaugesContract) => {
    try {
      const multicall = await stores.accountStore.getMulticall()
      const gaugeBalance = await this._getGaugeBalances(web3, multicall, pair, account, gaugesContract)
      return gaugeBalance
    } catch (ex) {
      try {
        const multicall = await stores.accountStore.getMulticall(true)
        const gaugeBalance = await this._getGaugeBalances(web3, multicall, pair, account, gaugesContract)
        return gaugeBalance
      } catch (ex) {
        throw ex
      }
    }
  }

  _getGaugeBalances = async (web3, multicall, pair, account, gaugesContract) => {
    try {
      const gaugeContract = new web3.eth.Contract(CONTRACTS.GAUGE_ABI, pair.gauge.address)

      if (account && account.address) {
        return multicall.aggregate([
          gaugeContract.methods.totalSupply(),
          gaugeContract.methods.balanceOf(account.address),
          gaugesContract.methods.weights(pair.address),
        ])
      } else {
        const result = await multicall.aggregate([
          gaugeContract.methods.totalSupply(),
          gaugesContract.methods.weights(pair.address),
        ])
        return [result[0], '0', result[1]]
      }
    } catch (ex) {
      console.log(ex)
      throw ex
    }
  }

  _getBaseAssetInfo = async (web3, account) => {
    try {
      const start = moment()

      const baseAssets = this.getStore('baseAssets')
      console.log('=== _getBaseAssetInfo ===', {
        baseAssetsCount: baseAssets?.length,
        account: account?.address,
        baseAssets: baseAssets,
      })
      if (!baseAssets) {
        console.warn('baseAssets not found')
        return null
      }

      const balanceOfs = await this._tryGetBalanceOfs(web3, baseAssets, account)
      console.log('Balance results from multicall:', balanceOfs)
      console.log('baseAssets before formatting:', baseAssets)

      let whitelists = []
      try {
        whitelists = await this._tryGetWhitelists(web3, baseAssets)
        console.log('whitelists:', whitelists)
      } catch (err) {
        console.error('Error fetching whitelists, using default:', err)
        // Default all to false if whitelist fetch fails
        whitelists = baseAssets.map(() => false)
      }

      for (let i = 0; i < baseAssets.length; i++) {
        try {
          const rawBalance = balanceOfs[i]
          const bnRaw = BigNumber(rawBalance)
          const divisor = BigNumber(10).pow(baseAssets[i].decimals)
          const bnFormatted = bnRaw.div(divisor)
          const formattedBalance = bnFormatted.toFixed(baseAssets[i].decimals)

          console.log(
            `${
              baseAssets[i].symbol
            }: raw=${rawBalance}, bnFormatted=${bnFormatted.toString()}, formatted=${formattedBalance}, decimals=${
              baseAssets[i].decimals
            }`
          )

          baseAssets[i].balance = formattedBalance
          baseAssets[i].value = BigNumber(baseAssets[i].balance).times(baseAssets[i].price || 0)
          baseAssets[i].isWhitelisted = whitelists[i]
        } catch (err) {
          console.error(`Error formatting balance for ${baseAssets[i].symbol}:`, err)
          baseAssets[i].balance = '0'
          baseAssets[i].value = BigNumber(0)
        }
      }
      console.log('Final baseAssets with balances:', baseAssets)

      const end = moment()
      const time = end.diff(start)
      console.log(`_getBaseAssetInfo took ${time} MS`)

      this.setStore({ baseAssets })
      this.emitter.emit(ACTIONS.UPDATED)
    } catch (ex) {
      console.log(ex)
    }
  }

  _tryGetBalanceOfs = async (web3, baseAssets, account) => {
    try {
      const multicall = await stores.accountStore.getMulticall()
      const balanceOfs = await this._getBalanceOfs(web3, multicall, baseAssets, account)
      return balanceOfs
    } catch (ex) {
      try {
        const multicall = await stores.accountStore.getMulticall(true)
        const balanceOfs = await this._getBalanceOfs(web3, multicall, baseAssets, account)
        return balanceOfs
      } catch (ex) {
        throw ex
      }
    }
  }

  _getBalanceOfs = async (web3, multicall, baseAssets, account) => {
    try {
      console.log('=== _getBalanceOfs ===', {
        hasAccount: !!account?.address,
        baseAssetsCount: baseAssets.length,
        multicall: !!multicall,
      })
      if (account && account.address) {
        // Fallback: fetch balances individually if multicall fails
        const balancePromises = baseAssets.map(async (asset) => {
          try {
            if (asset.address === 'ETH') {
              console.log('Getting ETH balance for:', account.address)
              const ethBalance = await web3.eth.getBalance(account.address)
              console.log('ETH balance:', ethBalance)
              return ethBalance
            }

            console.log('Getting token balance for:', asset.symbol, asset.address)
            const assetContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, asset.address)
            const balance = await assetContract.methods.balanceOf(account.address).call()
            console.log(`${asset.symbol} balance:`, balance)
            return balance
          } catch (err) {
            console.error(`Error fetching balance for ${asset.symbol}:`, err)
            return '0'
          }
        })

        const results = await Promise.all(balancePromises)
        console.log('Direct balance results:', results)
        return results
      } else {
        return baseAssets.map((asset) => {
          return '0'
        })
      }
    } catch (ex) {
      console.log(ex)
      throw ex
    }
  }

  _tryGetWhitelists = async (web3, baseAssets) => {
    try {
      const multicall = await stores.accountStore.getMulticall()
      const whitelists = await this._getWhitelists(web3, multicall, baseAssets)
      return whitelists
    } catch (ex) {
      try {
        const multicall = await stores.accountStore.getMulticall(true)
        const whitelists = await this._getWhitelists(web3, multicall, baseAssets)
        return whitelists
      } catch (ex) {
        throw ex
      }
    }
  }

  _getWhitelists = async (web3, multicall, baseAssets) => {
    try {
      const voterContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)

      const whitelistedCalls = baseAssets.map((asset) => {
        let addy = asset.address
        if (asset.address === 'ETH') {
          addy = CONTRACTS.WETH_ADDRESS
        }

        return voterContract.methods.isWhitelisted(addy)
      })

      return multicall.aggregate(whitelistedCalls)
    } catch (ex) {
      console.log(ex)
      throw ex
    }
  }

  searchBaseAsset = async (payload) => {
    try {
      let localBaseAssets = []
      const localBaseAssetsString = localStorage.getItem('stableSwap-assets')

      if (localBaseAssetsString && localBaseAssetsString !== '') {
        localBaseAssets = JSON.parse(localBaseAssetsString)
      }

      const theBaseAsset = localBaseAssets.filter((as) => {
        return as.address.toLowerCase() === payload.content.address.toLowerCase()
      })
      if (theBaseAsset.length > 0) {
        this.emitter.emit(ACTIONS.ASSET_SEARCHED, theBaseAsset)
        return
      }

      const baseAssetContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, payload.content.address)

      const [symbol, decimals, name] = await Promise.all([
        baseAssetContract.methods.symbol().call(),
        baseAssetContract.methods.decimals().call(),
        baseAssetContract.methods.name().call(),
      ])

      const newBaseAsset = {
        address: payload.content.address,
        symbol,
        name,
        decimals: parseInt(decimals),
      }

      localBaseAssets = [...localBaseAssets, newBaseAsset]
      localStorage.setItem('stableSwap-assets', JSON.stringify(localBaseAssets))

      const baseAssets = this.getStore('baseAssets')
      const storeBaseAssets = [...baseAssets, ...localBaseAssets]

      this.setStore({ baseAssets: storeBaseAssets })

      this.emitter.emit(ACTIONS.ASSET_SEARCHED, newBaseAsset)
    } catch (ex) {
      console.log(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  // Notifiy the backend to update the pair & get all pairs info
  updatePairsCall = async (web3, account, pairAddress = '', gaugeAddress = '') => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API}/api/v1/updatePairs?pair_address=${pairAddress}&gauge_address=${gaugeAddress}`,
        {
          method: 'get',
          // headers: {
          //   Authorization: `Basic ${process.env.NEXT_PUBLIC_API_TOKEN}`,
          // },
        }
      )
      const pairsCall = await response.json()
      // const pairsCall = updatePairsData // TODO: remove this line
      this.setStore({ pairs: pairsCall.data })

      await this._getPairsInfo(web3, account, pairsCall.data)
    } catch (ex) {
      console.log(ex)
    }
  }

  // sleep = (ms) => {
  //   return new Promise((resolve) => setTimeout(resolve, ms))
  // }

  getTXUUID = () => {
    return uuidv4()
  }

  createPairStake = async (payload) => {
    try {
      const context = this

      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { token0, token1, amount0, amount1, isStable, token, slippage } = payload.content

      let toki0 = token0.address
      let toki1 = token1.address
      if (token0.address === 'ETH') {
        toki0 = CONTRACTS.WETH_ADDRESS
      }
      if (token1.address === 'ETH') {
        toki1 = CONTRACTS.WETH_ADDRESS
      }

      const factoryContract = new web3.eth.Contract(CONTRACTS.FACTORY_ABI, CONTRACTS.FACTORY_ADDRESS)
      const pairFor = await factoryContract.methods.getPair(toki0, toki1, isStable).call()

      if (pairFor && pairFor != ZERO_ADDRESS) {
        await context.updatePairsCall(web3, account)
        this.emitter.emit(ACTIONS.ERROR, 'Pair already exists')
        return null
      }

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let allowance0TXID = this.getTXUUID()
      let allowance1TXID = this.getTXUUID()
      let depositTXID = this.getTXUUID()
      let createGaugeTXID = this.getTXUUID()
      let stakeAllowanceTXID = this.getTXUUID()
      let stakeTXID = this.getTXUUID()

      //DOD A CHECK FOR IF THE POOL ALREADY EXISTS

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Create liquidity pool for ${token0.symbol}/${token1.symbol}`,
        type: 'Liquidity',
        verb: 'Liquidity Pool Created',
        transactions: [
          {
            uuid: allowance0TXID,
            description: `Checking your ${token0.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: allowance1TXID,
            description: `Checking your ${token1.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: depositTXID,
            description: `Create liquidity pool`,
            status: 'WAITING',
          },
          {
            uuid: createGaugeTXID,
            description: `Create gauge`,
            status: 'WAITING',
          },
          {
            uuid: stakeAllowanceTXID,
            description: `Checking your pool allowance`,
            status: 'WAITING',
          },
          {
            uuid: stakeTXID,
            description: `Stake LP tokens in the gauge`,
            status: 'WAITING',
          },
        ],
      })

      let allowance0 = 0
      let allowance1 = 0

      // CHECK ALLOWANCES AND SET TX DISPLAY
      if (token0.address !== 'ETH') {
        allowance0 = await this._getDepositAllowance(web3, token0, account)
        if (BigNumber(allowance0).lt(amount0)) {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance0TXID,
            description: `Allow the router to spend your ${token0.symbol}`,
          })
        } else {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance0TXID,
            description: `Allowance on ${token0.symbol} sufficient`,
            status: 'DONE',
          })
        }
      } else {
        allowance0 = MAX_UINT256
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowance0TXID,
          description: `Allowance on ${token0.symbol} sufficient`,
          status: 'DONE',
        })
      }

      if (token1.address !== 'ETH') {
        allowance1 = await this._getDepositAllowance(web3, token1, account)
        if (BigNumber(allowance1).lt(amount1)) {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance1TXID,
            description: `Allow the router to spend your ${token1.symbol}`,
          })
        } else {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance1TXID,
            description: `Allowance on ${token1.symbol} sufficient`,
            status: 'DONE',
          })
        }
      } else {
        allowance1 = MAX_UINT256
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowance1TXID,
          description: `Allowance on ${token1.symbol} sufficient`,
          status: 'DONE',
        })
      }

      const gasPrice = await stores.accountStore.getGasPrice()

      const allowanceCallsPromises = []

      // SUBMIT REQUIRED ALLOWANCE TRANSACTIONS
      if (BigNumber(allowance0).lt(amount0)) {
        const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token0.address)

        const tokenPromise = new Promise((resolve, reject) => {
          context._callContractWait(
            web3,
            tokenContract,
            'approve',
            [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            allowance0TXID,
            (err) => {
              if (err) {
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(tokenPromise)
      }

      if (BigNumber(allowance1).lt(amount1)) {
        const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token1.address)

        const tokenPromise = new Promise((resolve, reject) => {
          context._callContractWait(
            web3,
            tokenContract,
            'approve',
            [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            allowance1TXID,
            (err) => {
              if (err) {
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(tokenPromise)
      }

      const done = await Promise.all(allowanceCallsPromises)

      // SUBMIT DEPOSIT TRANSACTION
      const sendSlippage = BigNumber(100).minus(slippage).div(100)
      const sendAmount0 = BigNumber(amount0)
        .times(10 ** token0.decimals)
        .toFixed(0)
      const sendAmount1 = BigNumber(amount1)
        .times(10 ** token1.decimals)
        .toFixed(0)
      const deadline = '' + moment().add(600, 'seconds').unix()
      const sendAmount0Min = BigNumber(amount0)
        .times(sendSlippage)
        .times(10 ** token0.decimals)
        .toFixed(0)
      const sendAmount1Min = BigNumber(amount1)
        .times(sendSlippage)
        .times(10 ** token1.decimals)
        .toFixed(0)

      let func = 'addLiquidity'
      let params = [
        token0.address,
        token1.address,
        isStable,
        sendAmount0,
        sendAmount1,
        sendAmount0Min,
        sendAmount1Min,
        account.address,
        deadline,
      ]
      let sendValue = null

      if (token0.address === 'ETH') {
        func = 'addLiquidityETH'
        params = [token1.address, isStable, sendAmount1, sendAmount1Min, sendAmount0Min, account.address, deadline]
        sendValue = sendAmount0
      }
      if (token1.address === 'ETH') {
        func = 'addLiquidityETH'
        params = [token0.address, isStable, sendAmount0, sendAmount0Min, sendAmount1Min, account.address, deadline]
        sendValue = sendAmount1
      }

      const routerContract = new web3.eth.Contract(CONTRACTS.ROUTER_ABI, CONTRACTS.ROUTER_ADDRESS)
      this._callContractWait(
        web3,
        routerContract,
        func,
        params,
        account,
        gasPrice,
        null,
        null,
        depositTXID,
        async (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          // GET PAIR FOR NEWLY CREATED LIQUIDITY POOL
          let tok0 = token0.address
          let tok1 = token1.address
          if (token0.address === 'ETH') {
            tok0 = CONTRACTS.WETH_ADDRESS
          }
          if (token1.address === 'ETH') {
            tok1 = CONTRACTS.WETH_ADDRESS
          }
          const pairFor = await factoryContract.methods.getPair(tok0, tok1, isStable).call()

          // SUBMIT CREATE GAUGE TRANSACTION
          const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)
          this._callContractWait(
            web3,
            gaugesContract,
            'createGauge',
            [pairFor],
            account,
            gasPrice,
            null,
            null,
            createGaugeTXID,
            async (err) => {
              if (err) {
                return this.emitter.emit(ACTIONS.ERROR, err)
              }

              const gaugeAddress = await gaugesContract.methods.gauges(pairFor).call()

              const pairContract = new web3.eth.Contract(CONTRACTS.PAIR_ABI, pairFor)
              const gaugeContract = new web3.eth.Contract(CONTRACTS.GAUGE_ABI, gaugeAddress)

              const balanceOf = await pairContract.methods.balanceOf(account.address).call()

              const pair = await this.getPairByAddress(pairFor)
              const stakeAllowance = await this._getStakeAllowance(web3, pair, account)

              if (
                BigNumber(stakeAllowance).lt(
                  BigNumber(balanceOf)
                    .div(10 ** pair.decimals)
                    .toFixed(pair.decimals)
                )
              ) {
                this.emitter.emit(ACTIONS.TX_STATUS, {
                  uuid: stakeAllowanceTXID,
                  description: `Allow the router to spend your ${pair.symbol}`,
                })
              } else {
                this.emitter.emit(ACTIONS.TX_STATUS, {
                  uuid: stakeAllowanceTXID,
                  description: `Allowance on ${pair.symbol} sufficient`,
                  status: 'DONE',
                })
              }

              const allowanceCallsPromise = []

              if (
                BigNumber(stakeAllowance).lt(
                  BigNumber(balanceOf)
                    .div(10 ** pair.decimals)
                    .toFixed(pair.decimals)
                )
              ) {
                const stakePromise = new Promise((resolve, reject) => {
                  context._callContractWait(
                    web3,
                    pairContract,
                    'approve',
                    [pair.gauge.address, MAX_UINT256],
                    account,
                    gasPrice,
                    null,
                    null,
                    stakeAllowanceTXID,
                    (err) => {
                      if (err) {
                        reject(err)
                        return
                      }

                      resolve()
                    }
                  )
                })

                allowanceCallsPromise.push(stakePromise)
              }

              const done = await Promise.all(allowanceCallsPromise)

              let sendTok = '0'
              if (token && token.id) {
                sendTok = token.id
              }

              this._callContractWait(
                web3,
                gaugeContract,
                'deposit',
                [balanceOf, sendTok],
                account,
                gasPrice,
                null,
                null,
                stakeTXID,
                async (err) => {
                  if (err) {
                    return this.emitter.emit(ACTIONS.ERROR, err)
                  }

                  await context.updatePairsCall(web3, account)

                  this.emitter.emit(ACTIONS.PAIR_CREATED, pairFor)
                }
              )
            }
          )
        },
        null,
        sendValue
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  createPairDeposit = async (payload) => {
    try {
      const context = this

      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { token0, token1, amount0, amount1, isStable, slippage } = payload.content

      let toki0 = token0.address
      let toki1 = token1.address
      if (token0.address === 'ETH') {
        toki0 = CONTRACTS.WETH_ADDRESS
      }
      if (token1.address === 'ETH') {
        toki1 = CONTRACTS.WETH_ADDRESS
      }

      const factoryContract = new web3.eth.Contract(CONTRACTS.FACTORY_ABI, CONTRACTS.FACTORY_ADDRESS)
      const pairFor = await factoryContract.methods.getPair(toki0, toki1, isStable).call()

      if (pairFor && pairFor != ZERO_ADDRESS) {
        await context.updatePairsCall(web3, account, pairFor)
        this.emitter.emit(ACTIONS.ERROR, 'Pair already exists')
        return null
      }

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let allowance0TXID = this.getTXUUID()
      let allowance1TXID = this.getTXUUID()
      let depositTXID = this.getTXUUID()
      let createGaugeTXID = this.getTXUUID()

      //DOD A CHECK FOR IF THE POOL ALREADY EXISTS

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Create liquidity pool for ${token0.symbol}/${token1.symbol}`,
        type: 'Liquidity',
        verb: 'Liquidity Pool Created',
        transactions: [
          {
            uuid: allowance0TXID,
            description: `Checking your ${token0.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: allowance1TXID,
            description: `Checking your ${token1.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: depositTXID,
            description: `Create liquidity pool`,
            status: 'WAITING',
          },
          {
            uuid: createGaugeTXID,
            description: `Create gauge`,
            status: 'WAITING',
          },
        ],
      })

      let allowance0 = 0
      let allowance1 = 0

      // CHECK ALLOWANCES AND SET TX DISPLAY
      if (token0.address !== 'ETH') {
        allowance0 = await this._getDepositAllowance(web3, token0, account)
        if (BigNumber(allowance0).lt(amount0)) {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance0TXID,
            description: `Allow the router to spend your ${token0.symbol}`,
          })
        } else {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance0TXID,
            description: `Allowance on ${token0.symbol} sufficient`,
            status: 'DONE',
          })
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        allowance0 = MAX_UINT256
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowance0TXID,
          description: `Allowance on ${token0.symbol} sufficient`,
          status: 'DONE',
        })
      }

      if (token1.address !== 'ETH') {
        allowance1 = await this._getDepositAllowance(web3, token1, account)
        if (BigNumber(allowance1).lt(amount1)) {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance1TXID,
            description: `Allow the router to spend your ${token1.symbol}`,
          })
        } else {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance1TXID,
            description: `Allowance on ${token1.symbol} sufficient`,
            status: 'DONE',
          })
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        allowance1 = MAX_UINT256
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowance1TXID,
          description: `Allowance on ${token1.symbol} sufficient`,
          status: 'DONE',
        })
      }

      const allowanceCallsPromises = []

      // SUBMIT REQUIRED ALLOWANCE TRANSACTIONS
      if (BigNumber(allowance0).lt(amount0)) {
        const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token0.address)
        const gasPrice = await stores.accountStore.getGasPrice()

        let amount0Bn = BigNumber(amount0)
          .times(10 ** token0.decimals)
          .toFixed(0)
        const tokenPromise = new Promise((resolve, reject) => {
          context._callContractWait(
            web3,
            tokenContract,
            'approve',
            [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            allowance0TXID,
            (err) => {
              if (err) {
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(tokenPromise)
      }

      if (BigNumber(allowance1).lt(amount1)) {
        const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token1.address)
        const gasPrice = await stores.accountStore.getGasPrice()

        let amount1Bn = BigNumber(amount1)
          .times(10 ** token1.decimals)
          .toFixed(0)

        const tokenPromise = new Promise((resolve, reject) => {
          context._callContractWait(
            web3,
            tokenContract,
            'approve',
            [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            allowance1TXID,
            (err) => {
              if (err) {
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(tokenPromise)
      }

      const done = await Promise.all(allowanceCallsPromises)

      // SUBMIT DEPOSIT TRANSACTION
      const sendSlippage = BigNumber(100).minus(slippage).div(100)
      const sendAmount0 = BigNumber(amount0)
        .times(10 ** token0.decimals)
        .toFixed(0)
      const sendAmount1 = BigNumber(amount1)
        .times(10 ** token1.decimals)
        .toFixed(0)
      const deadline = '' + moment().add(600, 'seconds').unix()
      const sendAmount0Min = BigNumber(amount0)
        .times(sendSlippage)
        .times(10 ** token0.decimals)
        .toFixed(0)
      const sendAmount1Min = BigNumber(amount1)
        .times(sendSlippage)
        .times(10 ** token1.decimals)
        .toFixed(0)

      let func = 'addLiquidity'
      let params = [
        token0.address,
        token1.address,
        isStable,
        sendAmount0,
        sendAmount1,
        sendAmount0Min,
        sendAmount1Min,
        account.address,
        deadline,
      ]
      let sendValue = null

      if (token0.address === 'ETH') {
        func = 'addLiquidityETH'
        params = [token1.address, isStable, sendAmount1, sendAmount1Min, sendAmount0Min, account.address, deadline]
        sendValue = sendAmount0
      }
      if (token1.address === 'ETH') {
        func = 'addLiquidityETH'
        params = [token0.address, isStable, sendAmount0, sendAmount0Min, sendAmount1Min, account.address, deadline]
        sendValue = sendAmount1
      }

      const routerContract = new web3.eth.Contract(CONTRACTS.ROUTER_ABI, CONTRACTS.ROUTER_ADDRESS)
      const gasPrice = await stores.accountStore.getGasPrice()
      this._callContractWait(
        web3,
        routerContract,
        func,
        params,
        account,
        gasPrice,
        null,
        null,
        depositTXID,
        async (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          // GET PAIR FOR NEWLY CREATED LIQUIDITY POOL
          let tok0 = token0.address
          let tok1 = token1.address
          if (token0.address === 'ETH') {
            tok0 = CONTRACTS.WETH_ADDRESS
          }
          if (token1.address === 'ETH') {
            tok1 = CONTRACTS.WETH_ADDRESS
          }
          const pairFor = await factoryContract.methods.getPair(tok0, tok1, isStable).call()

          // SUBMIT CREATE GAUGE TRANSACTION
          const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)
          const gasPrice = await stores.accountStore.getGasPrice()
          this._callContractWait(
            web3,
            gaugesContract,
            'createGauge',
            [pairFor],
            account,
            gasPrice,
            null,
            null,
            createGaugeTXID,
            async (err) => {
              if (err) {
                return this.emitter.emit(ACTIONS.ERROR, err)
              }

              await context.updatePairsCall(web3, account, pairFor)

              this.emitter.emit(ACTIONS.PAIR_CREATED, pairFor)
            },
            true
          )
        },
        null,
        sendValue
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  addLiquidity = async (payload) => {
    try {
      const context = this

      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { token0, token1, amount0, amount1, minLiquidity, pair, slippage } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let allowance0TXID = this.getTXUUID()
      let allowance1TXID = this.getTXUUID()
      let depositTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Add liquidity to ${pair.symbol}`,
        verb: 'Liquidity Added',
        type: 'Liquidity',
        transactions: [
          {
            uuid: allowance0TXID,
            description: `Checking your ${token0.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: allowance1TXID,
            description: `Checking your ${token1.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: depositTXID,
            description: `Deposit tokens in the pool`,
            status: 'WAITING',
          },
        ],
      })

      let allowance0 = 0
      let allowance1 = 0

      // CHECK ALLOWANCES AND SET TX DISPLAY
      if (token0.address !== 'ETH') {
        allowance0 = await this._getDepositAllowance(web3, token0, account)
        if (BigNumber(allowance0).lt(amount0)) {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance0TXID,
            description: `Allow the router to spend your ${token0.symbol}`,
          })
        } else {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance0TXID,
            description: `Allowance on ${token0.symbol} sufficient`,
            status: 'DONE',
          })
        }
      } else {
        allowance0 = MAX_UINT256
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowance0TXID,
          description: `Allowance on ${token0.symbol} sufficient`,
          status: 'DONE',
        })
      }

      if (token1.address !== 'ETH') {
        allowance1 = await this._getDepositAllowance(web3, token1, account)
        if (BigNumber(allowance1).lt(amount1)) {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance1TXID,
            description: `Allow the router to spend your ${token1.symbol}`,
          })
        } else {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowance1TXID,
            description: `Allowance on ${token1.symbol} sufficient`,
            status: 'DONE',
          })
        }
      } else {
        allowance1 = MAX_UINT256
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowance1TXID,
          description: `Allowance on ${token1.symbol} sufficient`,
          status: 'DONE',
        })
      }

      const gasPrice = await stores.accountStore.getGasPrice()

      const allowanceCallsPromises = []

      // SUBMIT REQUIRED ALLOWANCE TRANSACTIONS
      if (BigNumber(allowance0).lt(amount0)) {
        const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token0.address)

        let amount0Bn = BigNumber(amount0)
          .times(10 ** token0.decimals)
          .toFixed(0)

        const tokenPromise = new Promise((resolve, reject) => {
          context._callContractWait(
            web3,
            tokenContract,
            'approve',
            [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            allowance0TXID,
            (err) => {
              if (err) {
                console.log(err)
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(tokenPromise)
      }

      if (BigNumber(allowance1).lt(amount1)) {
        const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token1.address)

        let amount1Bn = BigNumber(amount1)
          .times(10 ** token1.decimals)
          .toFixed(0)

        const tokenPromise = new Promise((resolve, reject) => {
          context._callContractWait(
            web3,
            tokenContract,
            'approve',
            [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            allowance1TXID,
            (err) => {
              if (err) {
                console.log(err)
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(tokenPromise)
      }

      const done = await Promise.all(allowanceCallsPromises)

      // SUBMIT DEPOSIT TRANSACTION
      const sendSlippage = BigNumber(100).minus(slippage).div(100)
      const sendAmount0 = BigNumber(amount0)
        .times(10 ** token0.decimals)
        .toFixed(0)
      const sendAmount1 = BigNumber(amount1)
        .times(10 ** token1.decimals)
        .toFixed(0)
      const deadline = '' + moment().add(600, 'seconds').unix()
      const sendAmount0Min = BigNumber(amount0)
        .times(sendSlippage)
        .times(10 ** token0.decimals)
        .toFixed(0)
      const sendAmount1Min = BigNumber(amount1)
        .times(sendSlippage)
        .times(10 ** token1.decimals)
        .toFixed(0)

      const routerContract = new web3.eth.Contract(CONTRACTS.ROUTER_ABI, CONTRACTS.ROUTER_ADDRESS)

      let func = 'addLiquidity'
      let params = [
        token0.address,
        token1.address,
        pair.isStable,
        sendAmount0,
        sendAmount1,
        sendAmount0Min,
        sendAmount1Min,
        account.address,
        deadline,
      ]
      let sendValue = null

      if (token0.address === 'ETH') {
        func = 'addLiquidityETH'
        params = [token1.address, pair.isStable, sendAmount1, sendAmount1Min, sendAmount0Min, account.address, deadline]
        sendValue = sendAmount0
      }
      if (token1.address === 'ETH') {
        func = 'addLiquidityETH'
        params = [token0.address, pair.isStable, sendAmount0, sendAmount0Min, sendAmount1Min, account.address, deadline]
        sendValue = sendAmount1
      }

      this._callContractWait(
        web3,
        routerContract,
        func,
        params,
        account,
        gasPrice,
        null,
        null,
        depositTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this.getPairsInfo(web3, account)

          this.emitter.emit(ACTIONS.LIQUIDITY_ADDED)
        },
        null,
        sendValue
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  // stakeLiquidity = async (payload) => {
  //   try {
  //     const context = this

  //     const account = stores.accountStore.getStore('account')
  //     if (!account) {
  //       console.warn('account not found')
  //       return null
  //     }

  //     const web3 = await stores.accountStore.getWeb3Provider()
  //     if (!web3) {
  //       console.warn('web3 not found')
  //       return null
  //     }

  //     const { pair, token } = payload.content

  //     let stakeAllowanceTXID = this.getTXUUID()
  //     let stakeTXID = this.getTXUUID()

  //     this.emitter.emit(ACTIONS.TX_ADDED, {
  //       title: `Stake ${pair.symbol} in the gauge`,
  //       type: 'Liquidity',
  //       verb: 'Liquidity Staked',
  //       transactions: [
  //         {
  //           uuid: stakeAllowanceTXID,
  //           description: `Checking your ${pair.symbol} allowance`,
  //           status: 'WAITING',
  //         },
  //         {
  //           uuid: stakeTXID,
  //           description: `Stake LP tokens in the gauge`,
  //           status: 'WAITING',
  //         },
  //       ],
  //     })

  //     const stakeAllowance = await this._getStakeAllowance(web3, pair, account)

  //     const pairContract = new web3.eth.Contract(CONTRACTS.PAIR_ABI, pair.address)
  //     const balanceOf = await pairContract.methods.balanceOf(account.address).call()

  //     if (
  //       BigNumber(stakeAllowance).lt(
  //         BigNumber(balanceOf)
  //           .div(10 ** pair.decimals)
  //           .toFixed(pair.decimals)
  //       )
  //     ) {
  //       this.emitter.emit(ACTIONS.TX_STATUS, {
  //         uuid: stakeAllowanceTXID,
  //         description: `Allow the router to spend your ${pair.symbol}`,
  //       })
  //     } else {
  //       this.emitter.emit(ACTIONS.TX_STATUS, {
  //         uuid: stakeAllowanceTXID,
  //         description: `Allowance on ${pair.symbol} sufficient`,
  //         status: 'DONE',
  //       })
  //     }

  //     const gasPrice = await stores.accountStore.getGasPrice()

  //     const allowanceCallsPromises = []

  //     if (
  //       BigNumber(stakeAllowance).lt(
  //         BigNumber(balanceOf)
  //           .div(10 ** pair.decimals)
  //           .toFixed(pair.decimals)
  //       )
  //     ) {
  //       const stakePromise = new Promise((resolve, reject) => {
  //         context._callContractWait(
  //           web3,
  //           pairContract,
  //           'approve',
  //           [pair.gauge.address, MAX_UINT256],
  //           account,
  //           gasPrice,
  //           null,
  //           null,
  //           stakeAllowanceTXID,
  //           (err) => {
  //             if (err) {
  //               reject(err)
  //               return
  //             }

  //             resolve()
  //           }
  //         )
  //       })

  //       allowanceCallsPromises.push(stakePromise)
  //     }

  //     const done = await Promise.all(allowanceCallsPromises)

  //     const gaugeContract = new web3.eth.Contract(CONTRACTS.GAUGE_ABI, pair.gauge.address)

  //     let sendTok = '0'
  //     if (token && token.id) {
  //       sendTok = token.id
  //     }

  //     this._callContractWait(
  //       web3,
  //       gaugeContract,
  //       'deposit',
  //       [balanceOf, sendTok],
  //       account,
  //       gasPrice,
  //       null,
  //       null,
  //       stakeTXID,
  //       (err) => {
  //         if (err) {
  //           return this.emitter.emit(ACTIONS.ERROR, err)
  //         }

  //         this._getPairsInfo(web3, account)

  //         this.emitter.emit(ACTIONS.LIQUIDITY_STAKED)
  //       }
  //     )
  //   } catch (ex) {
  //     console.error(ex)
  //     this.emitter.emit(ACTIONS.ERROR, ex)
  //   }
  // }

  stakeLiquidityWithAmount = async (payload) => {
    try {
      const context = this

      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { pair, token, stakeAmount } = payload.content
      let stakeAllowanceTXID = this.getTXUUID()
      let stakeTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Stake ${pair.symbol} in the gauge`,
        type: 'Liquidity',
        verb: 'Liquidity Staked',
        transactions: [
          {
            uuid: stakeAllowanceTXID,
            description: `Checking your ${pair.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: stakeTXID,
            description: `Stake LP tokens in the gauge`,
            status: 'WAITING',
          },
        ],
      })

      const stakeAllowance = await this._getStakeAllowance(web3, pair, account)

      const pairContract = new web3.eth.Contract(CONTRACTS.PAIR_ABI, pair.address)
      // const balanceOf = await pairContract.methods.balanceOf(account.address).call()

      if (BigNumber(stakeAllowance).lt(stakeAmount)) {
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: stakeAllowanceTXID,
          description: `Allow the router to spend your ${pair.symbol}`,
        })
      } else {
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: stakeAllowanceTXID,
          description: `Allowance on ${pair.symbol} sufficient`,
          status: 'DONE',
        })
      }

      const gasPrice = await stores.accountStore.getGasPrice()

      const allowanceCallsPromises = []

      if (BigNumber(stakeAllowance).lt(stakeAmount)) {
        let stakeAmountBn = BigNumber(stakeAmount)
          .times(10 ** pair.decimals)
          .toFixed(0)

        const stakePromise = new Promise((resolve, reject) => {
          context._callContractWait(
            web3,
            pairContract,
            'approve',
            [pair.gauge.address, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            stakeAllowanceTXID,
            (err) => {
              if (err) {
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(stakePromise)
      }

      const done = await Promise.all(allowanceCallsPromises)

      const gaugeContract = new web3.eth.Contract(CONTRACTS.GAUGE_ABI, pair.gauge.address)

      const sendAmount = BigNumber(stakeAmount)
        .times(10 ** pair.decimals)
        .toFixed(0)

      let sendTok = '0'
      if (token && token.id) {
        sendTok = token.id
      }

      this._callContractWait(
        web3,
        gaugeContract,
        'deposit',
        [sendAmount, sendTok],
        account,
        gasPrice,
        null,
        null,
        stakeTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this.getPairsInfo(web3, account)

          this.emitter.emit(ACTIONS.LIQUIDITY_STAKED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  // addLiquidityAndStake = async (payload) => {
  //   try {
  //     const context = this

  //     const account = stores.accountStore.getStore('account')
  //     if (!account) {
  //       console.warn('account not found')
  //       return null
  //     }

  //     const web3 = await stores.accountStore.getWeb3Provider()
  //     if (!web3) {
  //       console.warn('web3 not found')
  //       return null
  //     }

  //     const { token0, token1, amount0, amount1, minLiquidity, pair, token, slippage } = payload.content

  //     // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
  //     let allowance0TXID = this.getTXUUID()
  //     let allowance1TXID = this.getTXUUID()
  //     let stakeAllowanceTXID = this.getTXUUID()
  //     let depositTXID = this.getTXUUID()
  //     let stakeTXID = this.getTXUUID()

  //     this.emitter.emit(ACTIONS.TX_ADDED, {
  //       title: `Add liquidity to ${pair.symbol}`,
  //       type: 'Liquidity',
  //       verb: 'Liquidity Added',
  //       transactions: [
  //         {
  //           uuid: allowance0TXID,
  //           description: `Checking your ${token0.symbol} allowance`,
  //           status: 'WAITING',
  //         },
  //         {
  //           uuid: allowance1TXID,
  //           description: `Checking your ${token1.symbol} allowance`,
  //           status: 'WAITING',
  //         },
  //         {
  //           uuid: stakeAllowanceTXID,
  //           description: `Checking your ${pair.symbol} allowance`,
  //           status: 'WAITING',
  //         },
  //         {
  //           uuid: depositTXID,
  //           description: `Deposit tokens in the pool`,
  //           status: 'WAITING',
  //         },
  //         {
  //           uuid: stakeTXID,
  //           description: `Stake LP tokens in the gauge`,
  //           status: 'WAITING',
  //         },
  //       ],
  //     })

  //     let allowance0 = 0
  //     let allowance1 = 0

  //     // CHECK ALLOWANCES AND SET TX DISPLAY
  //     if (token0.address !== 'ETH') {
  //       allowance0 = await this._getDepositAllowance(web3, token0, account)
  //       if (BigNumber(allowance0).lt(amount0)) {
  //         this.emitter.emit(ACTIONS.TX_STATUS, {
  //           uuid: allowance0TXID,
  //           description: `Allow the router to spend your ${token0.symbol}`,
  //         })
  //       } else {
  //         this.emitter.emit(ACTIONS.TX_STATUS, {
  //           uuid: allowance0TXID,
  //           description: `Allowance on ${token0.symbol} sufficient`,
  //           status: 'DONE',
  //         })
  //       }
  //     } else {
  //       allowance0 = MAX_UINT256
  //       this.emitter.emit(ACTIONS.TX_STATUS, {
  //         uuid: allowance0TXID,
  //         description: `Allowance on ${token0.symbol} sufficient`,
  //         status: 'DONE',
  //       })
  //     }

  //     if (token1.address !== 'ETH') {
  //       allowance1 = await this._getDepositAllowance(web3, token1, account)
  //       if (BigNumber(allowance1).lt(amount1)) {
  //         this.emitter.emit(ACTIONS.TX_STATUS, {
  //           uuid: allowance1TXID,
  //           description: `Allow the router to spend your ${token1.symbol}`,
  //         })
  //       } else {
  //         this.emitter.emit(ACTIONS.TX_STATUS, {
  //           uuid: allowance1TXID,
  //           description: `Allowance on ${token1.symbol} sufficient`,
  //           status: 'DONE',
  //         })
  //       }
  //     } else {
  //       allowance1 = MAX_UINT256
  //       this.emitter.emit(ACTIONS.TX_STATUS, {
  //         uuid: allowance1TXID,
  //         description: `Allowance on ${token1.symbol} sufficient`,
  //         status: 'DONE',
  //       })
  //     }

  //     const stakeAllowance = await this._getStakeAllowance(web3, pair, account)

  //     if (BigNumber(stakeAllowance).lt(minLiquidity)) {
  //       this.emitter.emit(ACTIONS.TX_STATUS, {
  //         uuid: stakeAllowanceTXID,
  //         description: `Allow the router to spend your ${pair.symbol}`,
  //       })
  //     } else {
  //       this.emitter.emit(ACTIONS.TX_STATUS, {
  //         uuid: stakeAllowanceTXID,
  //         description: `Allowance on ${pair.symbol} sufficient`,
  //         status: 'DONE',
  //       })
  //     }

  //     const gasPrice = await stores.accountStore.getGasPrice()

  //     const allowanceCallsPromises = []

  //     // SUBMIT REQUIRED ALLOWANCE TRANSACTIONS
  //     if (BigNumber(allowance0).lt(amount0)) {
  //       const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token0.address)

  //       const tokenPromise = new Promise((resolve, reject) => {
  //         context._callContractWait(
  //           web3,
  //           tokenContract,
  //           'approve',
  //           [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
  //           account,
  //           gasPrice,
  //           null,
  //           null,
  //           allowance0TXID,
  //           (err) => {
  //             if (err) {
  //               reject(err)
  //               return
  //             }

  //             resolve()
  //           }
  //         )
  //       })

  //       allowanceCallsPromises.push(tokenPromise)
  //     }

  //     if (BigNumber(allowance1).lt(amount1)) {
  //       const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token1.address)

  //       const tokenPromise = new Promise((resolve, reject) => {
  //         context._callContractWait(
  //           web3,
  //           tokenContract,
  //           'approve',
  //           [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
  //           account,
  //           gasPrice,
  //           null,
  //           null,
  //           allowance1TXID,
  //           (err) => {
  //             if (err) {
  //               reject(err)
  //               return
  //             }

  //             resolve()
  //           }
  //         )
  //       })

  //       allowanceCallsPromises.push(tokenPromise)
  //     }

  //     if (BigNumber(stakeAllowance).lt(minLiquidity)) {
  //       const pairContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, pair.address)

  //       const stakePromise = new Promise((resolve, reject) => {
  //         context._callContractWait(
  //           web3,
  //           pairContract,
  //           'approve',
  //           [pair.gauge.address, MAX_UINT256],
  //           account,
  //           gasPrice,
  //           null,
  //           null,
  //           stakeAllowanceTXID,
  //           (err) => {
  //             if (err) {
  //               reject(err)
  //               return
  //             }

  //             resolve()
  //           }
  //         )
  //       })

  //       allowanceCallsPromises.push(stakePromise)
  //     }

  //     const done = await Promise.all(allowanceCallsPromises)

  //     // SUBMIT DEPOSIT TRANSACTION
  //     const sendSlippage = BigNumber(100).minus(slippage).div(100)
  //     const sendAmount0 = BigNumber(amount0)
  //       .times(10 ** token0.decimals)
  //       .toFixed(0)
  //     const sendAmount1 = BigNumber(amount1)
  //       .times(10 ** token1.decimals)
  //       .toFixed(0)
  //     const deadline = '' + moment().add(600, 'seconds').unix()
  //     const sendAmount0Min = BigNumber(amount0)
  //       .times(sendSlippage)
  //       .times(10 ** token0.decimals)
  //       .toFixed(0)
  //     const sendAmount1Min = BigNumber(amount1)
  //       .times(sendSlippage)
  //       .times(10 ** token1.decimals)
  //       .toFixed(0)

  //     const routerContract = new web3.eth.Contract(CONTRACTS.ROUTER_ABI, CONTRACTS.ROUTER_ADDRESS)
  //     const gaugeContract = new web3.eth.Contract(CONTRACTS.GAUGE_ABI, pair.gauge.address)
  //     const pairContract = new web3.eth.Contract(CONTRACTS.PAIR_ABI, pair.address)

  //     let func = 'addLiquidity'
  //     let params = [
  //       token0.address,
  //       token1.address,
  //       pair.isStable,
  //       sendAmount0,
  //       sendAmount1,
  //       sendAmount0Min,
  //       sendAmount1Min,
  //       account.address,
  //       deadline,
  //     ]
  //     let sendValue = null

  //     if (token0.address === 'ETH') {
  //       func = 'addLiquidityETH'
  //       params = [token1.address, pair.isStable, sendAmount1, sendAmount1Min, sendAmount0Min, account.address, deadline]
  //       sendValue = sendAmount0
  //     }
  //     if (token1.address === 'ETH') {
  //       func = 'addLiquidityETH'
  //       params = [token0.address, pair.isStable, sendAmount0, sendAmount0Min, sendAmount1Min, account.address, deadline]
  //       sendValue = sendAmount1
  //     }

  //     this._callContractWait(
  //       web3,
  //       routerContract,
  //       func,
  //       params,
  //       account,
  //       gasPrice,
  //       null,
  //       null,
  //       depositTXID,
  //       async (err) => {
  //         if (err) {
  //           return this.emitter.emit(ACTIONS.ERROR, err)
  //         }

  //         const balanceOf = await pairContract.methods.balanceOf(account.address).call()

  //         let sendTok = '0'
  //         if (token && token.id) {
  //           sendTok = token.id
  //         }

  //         this._callContractWait(
  //           web3,
  //           gaugeContract,
  //           'deposit',
  //           [balanceOf, sendTok],
  //           account,
  //           gasPrice,
  //           null,
  //           null,
  //           stakeTXID,
  //           (err) => {
  //             if (err) {
  //               return this.emitter.emit(ACTIONS.ERROR, err)
  //             }

  //             this._getPairsInfo(web3, account)

  //             this.emitter.emit(ACTIONS.ADD_LIQUIDITY_AND_STAKED)
  //           }
  //         )
  //       },
  //       null,
  //       sendValue
  //     )
  //   } catch (ex) {
  //     console.error(ex)
  //     this.emitter.emit(ACTIONS.ERROR, ex)
  //   }
  // }

  _getDepositAllowance = async (web3, token, account) => {
    try {
      const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token.address)
      const allowance = await tokenContract.methods.allowance(account.address, CONTRACTS.ROUTER_ADDRESS).call()
      return BigNumber(allowance)
        .div(10 ** token.decimals)
        .toFixed(token.decimals)
    } catch (ex) {
      console.error(ex)
      return null
    }
  }

  _getStakeAllowance = async (web3, pair, account) => {
    try {
      const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, pair.address)
      const allowance = await tokenContract.methods.allowance(account.address, pair.gauge.address).call()
      return BigNumber(allowance)
        .div(10 ** pair.decimals)
        .toFixed(pair.decimals)
    } catch (ex) {
      console.error(ex)
      return null
    }
  }

  _getWithdrawAllowance = async (web3, pair, account) => {
    try {
      const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, pair.address)
      const allowance = await tokenContract.methods.allowance(account.address, CONTRACTS.ROUTER_ADDRESS).call()
      return BigNumber(allowance)
        .div(10 ** pair.decimals)
        .toFixed(pair.decimals)
    } catch (ex) {
      console.error(ex)
      return null
    }
  }

  quoteAddLiquidity = async (payload) => {
    try {
      // const account = stores.accountStore.getStore('account')
      // if (!account) {
      //   console.warn('account not found')
      //   return null
      // }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { pair, token0, token1, amount0, amount1 } = payload.content

      if (!pair || !token0 || !token1 || amount0 == '' || amount1 == '') {
        return null
      }

      const gasPrice = await stores.accountStore.getGasPrice()
      const routerContract = new web3.eth.Contract(CONTRACTS.ROUTER_ABI, CONTRACTS.ROUTER_ADDRESS)

      const sendAmount0 = BigNumber(amount0)
        .times(10 ** token0.decimals)
        .toFixed(0)
      const sendAmount1 = BigNumber(amount1)
        .times(10 ** token1.decimals)
        .toFixed(0)

      let addy0 = token0.address
      let addy1 = token1.address

      if (token0.address === 'ETH') {
        addy0 = CONTRACTS.WETH_ADDRESS
      }
      if (token1.address === 'ETH') {
        addy1 = CONTRACTS.WETH_ADDRESS
      }

      const res = await routerContract.methods
        .quoteAddLiquidity(addy0, addy1, pair.isStable, sendAmount0, sendAmount1)
        .call()

      const returnVal = {
        inputs: {
          token0,
          token1,
          amount0,
          amount1,
        },
        output: BigNumber(res.liquidity)
          .div(10 ** pair.decimals)
          .toFixed(pair.decimals),
      }
      this.emitter.emit(ACTIONS.QUOTE_ADD_LIQUIDITY_RETURNED, returnVal)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  getLiquidityBalances = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { pair } = payload.content

      if (!pair) {
        return
      }

      const token0Contract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, pair.token0.address)
      const token1Contract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, pair.token1.address)
      const pairContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, pair.address)

      const balanceCalls = [
        token0Contract.methods.balanceOf(account.address).call(),
        token1Contract.methods.balanceOf(account.address).call(),
        pairContract.methods.balanceOf(account.address).call(),
      ]

      if (pair.gauge) {
        const gaugeContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, pair.gauge.address)
        balanceCalls.push(gaugeContract.methods.balanceOf(account.address).call())
        // balanceCalls.push(gaugeContract.methods.earned(incentiveAddress, account.address).call())
      }

      const [token0Balance, token1Balance, poolBalance, gaugeBalance /*, earned*/] = await Promise.all(balanceCalls)

      const returnVal = {
        token0: BigNumber(token0Balance)
          .div(10 ** pair.token0.decimals)
          .toFixed(pair.token0.decimals),
        token1: BigNumber(token1Balance)
          .div(10 ** pair.token1.decimals)
          .toFixed(pair.token1.decimals),
        pool: BigNumber(poolBalance)
          .div(10 ** 18)
          .toFixed(18),
      }

      if (pair.gauge) {
        returnVal.gauge = gaugeBalance
          ? BigNumber(gaugeBalance)
              .div(10 ** 18)
              .toFixed(18)
          : null
        // returnVal.earned = BigNumber(earned).div(10**incentiveAsset.decimals).toFixed(incentiveAsset.decimals),
      }

      this.emitter.emit(ACTIONS.GET_LIQUIDITY_BALANCES_RETURNED, returnVal)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  // removeLiquidity = async (payload) => {
  //   try {
  //     const context = this

  //     const account = stores.accountStore.getStore('account')
  //     if (!account) {
  //       console.warn('account not found')
  //       return null
  //     }

  //     const web3 = await stores.accountStore.getWeb3Provider()
  //     if (!web3) {
  //       console.warn('web3 not found')
  //       return null
  //     }

  //     const { token0, token1, pair, slippage } = payload.content

  //     // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
  //     let allowanceTXID = this.getTXUUID()
  //     let withdrawTXID = this.getTXUUID()

  //     this.emitter.emit(ACTIONS.TX_ADDED, {
  //       title: `Remove liquidity from ${pair.symbol}`,
  //       type: 'Liquidity',
  //       verb: 'Liquidity Removed',
  //       transactions: [
  //         {
  //           uuid: allowanceTXID,
  //           description: `Checking your ${pair.symbol} allowance`,
  //           status: 'WAITING',
  //         },
  //         {
  //           uuid: withdrawTXID,
  //           description: `Withdraw tokens from the pool`,
  //           status: 'WAITING',
  //         },
  //       ],
  //     })

  //     // CHECK ALLOWANCES AND SET TX DISPLAY
  //     const allowance = await this._getWithdrawAllowance(web3, pair, account)

  //     if (BigNumber(allowance).lt(pair.balance)) {
  //       this.emitter.emit(ACTIONS.TX_STATUS, {
  //         uuid: allowanceTXID,
  //         description: `Allow the router to spend your ${pair.symbol}`,
  //       })
  //     } else {
  //       this.emitter.emit(ACTIONS.TX_STATUS, {
  //         uuid: allowanceTXID,
  //         description: `Allowance on ${pair.symbol} sufficient`,
  //         status: 'DONE',
  //       })
  //     }

  //     const gasPrice = await stores.accountStore.getGasPrice()

  //     const allowanceCallsPromises = []

  //     // SUBMIT REQUIRED ALLOWANCE TRANSACTIONS
  //     if (BigNumber(allowance).lt(pair.balance)) {
  //       const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, pair.address)

  //       const tokenPromise = new Promise((resolve, reject) => {
  //         context._callContractWait(
  //           web3,
  //           tokenContract,
  //           'approve',
  //           [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
  //           account,
  //           gasPrice,
  //           null,
  //           null,
  //           allowanceTXID,
  //           (err) => {
  //             if (err) {
  //               console.log(err)
  //               reject(err)
  //               return
  //             }

  //             resolve()
  //           }
  //         )
  //       })

  //       allowanceCallsPromises.push(tokenPromise)
  //     }

  //     const done = await Promise.all(allowanceCallsPromises)

  //     // SUBMIT WITHDRAW TRANSACTION
  //     const sendAmount = BigNumber(pair.balance)
  //       .times(10 ** pair.decimals)
  //       .toFixed(0)

  //     const routerContract = new web3.eth.Contract(CONTRACTS.ROUTER_ABI, CONTRACTS.ROUTER_ADDRESS)

  //     const quoteRemove = await routerContract.methods
  //       .quoteRemoveLiquidity(token0.address, token1.address, pair.isStable, sendAmount)
  //       .call()

  //     const sendSlippage = BigNumber(100).minus(slippage).div(100)
  //     const deadline = '' + moment().add(600, 'seconds').unix()
  //     const sendAmount0Min = BigNumber(quoteRemove.amountA).times(sendSlippage).toFixed(0)
  //     const sendAmount1Min = BigNumber(quoteRemove.amountB).times(sendSlippage).toFixed(0)

  //     this._callContractWait(
  //       web3,
  //       routerContract,
  //       'removeLiquidity',
  //       [
  //         token0.address,
  //         token1.address,
  //         pair.isStable,
  //         sendAmount,
  //         sendAmount0Min,
  //         sendAmount1Min,
  //         account.address,
  //         deadline,
  //       ],
  //       account,
  //       gasPrice,
  //       null,
  //       null,
  //       withdrawTXID,
  //       (err) => {
  //         if (err) {
  //           return this.emitter.emit(ACTIONS.ERROR, err)
  //         }

  //         this._getPairsInfo(web3, account)

  //         this.emitter.emit(ACTIONS.LIQUIDITY_REMOVED)
  //       }
  //     )
  //   } catch (ex) {
  //     console.error(ex)
  //     this.emitter.emit(ACTIONS.ERROR, ex)
  //   }
  // }

  removeLiquidityWithAmount = async (payload) => {
    try {
      const context = this

      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { token0, token1, pair, slippage, withdrawAmount } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let allowanceTXID = this.getTXUUID()
      let withdrawTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Remove liquidity from ${pair.symbol}`,
        type: 'Liquidity',
        verb: 'Liquidity Removed',
        transactions: [
          {
            uuid: allowanceTXID,
            description: `Checking your ${pair.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: withdrawTXID,
            description: `Withdraw tokens from the pool`,
            status: 'WAITING',
          },
        ],
      })

      // CHECK ALLOWANCES AND SET TX DISPLAY
      const allowance = await this._getWithdrawAllowance(web3, pair, account)

      if (BigNumber(allowance).lt(withdrawAmount)) {
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowanceTXID,
          description: `Allow the router to spend your ${pair.symbol}`,
        })
      } else {
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowanceTXID,
          description: `Allowance on ${pair.symbol} sufficient`,
          status: 'DONE',
        })
      }

      const gasPrice = await stores.accountStore.getGasPrice()

      const allowanceCallsPromises = []

      // SUBMIT REQUIRED ALLOWANCE TRANSACTIONS
      if (BigNumber(allowance).lt(withdrawAmount)) {
        const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, pair.address)

        let withdrawAmountBn = BigNumber(withdrawAmount)
          .times(10 ** pair.decimals)
          .toFixed(0)

        const tokenPromise = new Promise((resolve, reject) => {
          context._callContractWait(
            web3,
            tokenContract,
            'approve',
            [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            allowanceTXID,
            (err) => {
              if (err) {
                console.log(err)
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(tokenPromise)
      }

      const done = await Promise.all(allowanceCallsPromises)

      // SUBMIT WITHDRAW TRANSACTION
      const sendAmount = BigNumber(withdrawAmount)
        .times(10 ** pair.decimals)
        .toFixed(0)

      const routerContract = new web3.eth.Contract(CONTRACTS.ROUTER_ABI, CONTRACTS.ROUTER_ADDRESS)

      const quoteRemove = await routerContract.methods
        .quoteRemoveLiquidity(token0.address, token1.address, pair.isStable, sendAmount)
        .call()

      const sendSlippage = BigNumber(100).minus(slippage).div(100)
      const deadline = '' + moment().add(600, 'seconds').unix()
      const sendAmount0Min = BigNumber(quoteRemove.amountA).times(sendSlippage).toFixed(0)
      const sendAmount1Min = BigNumber(quoteRemove.amountB).times(sendSlippage).toFixed(0)

      this._callContractWait(
        web3,
        routerContract,
        'removeLiquidity',
        [
          token0.address,
          token1.address,
          pair.isStable,
          sendAmount,
          sendAmount0Min,
          sendAmount1Min,
          account.address,
          deadline,
        ],
        account,
        gasPrice,
        null,
        null,
        withdrawTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this.getPairsInfo(web3, account)

          this.emitter.emit(ACTIONS.LIQUIDITY_REMOVED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  // unstakeAndRemoveLiquidity = async (payload) => {
  //   try {
  //     const context = this

  //     const account = stores.accountStore.getStore('account')
  //     if (!account) {
  //       console.warn('account not found')
  //       return null
  //     }

  //     const web3 = await stores.accountStore.getWeb3Provider()
  //     if (!web3) {
  //       console.warn('web3 not found')
  //       return null
  //     }

  //     const { token0, token1, amount, amount0, amount1, pair, slippage } = payload.content

  //     // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
  //     let allowanceTXID = this.getTXUUID()
  //     let withdrawTXID = this.getTXUUID()
  //     let unstakeTXID = this.getTXUUID()

  //     this.emitter.emit(ACTIONS.TX_ADDED, {
  //       title: `Remove liquidity from ${pair.symbol}`,
  //       type: 'Liquidity',
  //       verb: 'Liquidity Removed',
  //       transactions: [
  //         {
  //           uuid: allowanceTXID,
  //           description: `Checking your ${pair.symbol} allowance`,
  //           status: 'WAITING',
  //         },
  //         {
  //           uuid: unstakeTXID,
  //           description: `Unstake LP tokens from the gauge`,
  //           status: 'WAITING',
  //         },
  //         {
  //           uuid: withdrawTXID,
  //           description: `Withdraw tokens from the pool`,
  //           status: 'WAITING',
  //         },
  //       ],
  //     })

  //     // CHECK ALLOWANCES AND SET TX DISPLAY
  //     const allowance = await this._getWithdrawAllowance(web3, pair, account)

  //     if (BigNumber(allowance).lt(amount)) {
  //       this.emitter.emit(ACTIONS.TX_STATUS, {
  //         uuid: allowanceTXID,
  //         description: `Allow the router to spend your ${pair.symbol}`,
  //       })
  //     } else {
  //       this.emitter.emit(ACTIONS.TX_STATUS, {
  //         uuid: allowanceTXID,
  //         description: `Allowance on ${pair.symbol} sufficient`,
  //         status: 'DONE',
  //       })
  //     }

  //     const gasPrice = await stores.accountStore.getGasPrice()

  //     const allowanceCallsPromises = []

  //     // SUBMIT REQUIRED ALLOWANCE TRANSACTIONS
  //     if (BigNumber(allowance).lt(amount)) {
  //       const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, pair.address)

  //       const tokenPromise = new Promise((resolve, reject) => {
  //         context._callContractWait(
  //           web3,
  //           tokenContract,
  //           'approve',
  //           [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
  //           account,
  //           gasPrice,
  //           null,
  //           null,
  //           allowanceTXID,
  //           (err) => {
  //             if (err) {
  //               reject(err)
  //               return
  //             }

  //             resolve()
  //           }
  //         )
  //       })

  //       allowanceCallsPromises.push(tokenPromise)
  //     }

  //     const done = await Promise.all(allowanceCallsPromises)

  //     // SUBMIT DEPOSIT TRANSACTION
  //     const sendSlippage = BigNumber(100).minus(slippage).div(100)
  //     const sendAmount = BigNumber(amount)
  //       .times(10 ** pair.decimals)
  //       .toFixed(0)
  //     const deadline = '' + moment().add(600, 'seconds').unix()
  //     const sendAmount0Min = BigNumber(amount0)
  //       .times(sendSlippage)
  //       .times(10 ** token0.decimals)
  //       .toFixed(0)
  //     const sendAmount1Min = BigNumber(amount1)
  //       .times(sendSlippage)
  //       .times(10 ** token1.decimals)
  //       .toFixed(0)

  //     const routerContract = new web3.eth.Contract(CONTRACTS.ROUTER_ABI, CONTRACTS.ROUTER_ADDRESS)
  //     const gaugeContract = new web3.eth.Contract(CONTRACTS.GAUGE_ABI, pair.gauge.address)
  //     const pairContract = new web3.eth.Contract(CONTRACTS.PAIR_ABI, pair.address)

  //     this._callContractWait(
  //       web3,
  //       gaugeContract,
  //       'withdraw',
  //       [sendAmount],
  //       account,
  //       gasPrice,
  //       null,
  //       null,
  //       unstakeTXID,
  //       async (err) => {
  //         if (err) {
  //           return this.emitter.emit(ACTIONS.ERROR, err)
  //         }

  //         const balanceOf = await pairContract.methods.balanceOf(account.address).call()

  //         this._callContractWait(
  //           web3,
  //           routerContract,
  //           'removeLiquidity',
  //           [
  //             token0.address,
  //             token1.address,
  //             pair.isStable,
  //             balanceOf,
  //             sendAmount0Min,
  //             sendAmount1Min,
  //             account.address,
  //             deadline,
  //           ],
  //           account,
  //           gasPrice,
  //           null,
  //           null,
  //           withdrawTXID,
  //           (err) => {
  //             if (err) {
  //               return this.emitter.emit(ACTIONS.ERROR, err)
  //             }

  //             this._getPairsInfo(web3, account)

  //             this.emitter.emit(ACTIONS.REMOVE_LIQUIDITY_AND_UNSTAKED)
  //           }
  //         )
  //       }
  //     )
  //   } catch (ex) {
  //     console.error(ex)
  //     this.emitter.emit(ACTIONS.ERROR, ex)
  //   }
  // }

  unstakeLiquidity = async (payload) => {
    try {
      const context = this

      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { amount, pair } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let unstakeTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Unstake liquidity from gauge`,
        type: 'Liquidity',
        verb: 'Liquidity Unstaked',
        transactions: [
          {
            uuid: unstakeTXID,
            description: `Unstake LP tokens from the gauge`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT DEPOSIT TRANSACTION
      const sendAmount = BigNumber(amount)
        .times(10 ** pair.decimals)
        .toFixed(0)

      const gaugeContract = new web3.eth.Contract(CONTRACTS.GAUGE_ABI, pair.gauge.address)

      this._callContractWait(
        web3,
        gaugeContract,
        'withdraw',
        [sendAmount],
        account,
        gasPrice,
        null,
        null,
        unstakeTXID,
        async (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this.getPairsInfo(web3, account)

          this.emitter.emit(ACTIONS.LIQUIDITY_UNSTAKED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  quoteRemoveLiquidity = async (payload) => {
    try {
      // const account = stores.accountStore.getStore('account')
      // if (!account) {
      //   console.warn('account not found')
      //   return null
      // }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { pair, token0, token1, withdrawAmount } = payload.content

      if (!pair || !token0 || !token1 || withdrawAmount == '') {
        return null
      }

      const gasPrice = await stores.accountStore.getGasPrice()
      const routerContract = new web3.eth.Contract(CONTRACTS.ROUTER_ABI, CONTRACTS.ROUTER_ADDRESS)

      const sendWithdrawAmount = BigNumber(withdrawAmount)
        .times(10 ** pair.decimals)
        .toFixed(0)

      const res = await routerContract.methods
        .quoteRemoveLiquidity(token0.address, token1.address, pair.isStable, sendWithdrawAmount)
        .call()

      const returnVal = {
        inputs: {
          token0,
          token1,
          withdrawAmount,
        },
        output: {
          amount0: BigNumber(res.amountA)
            .div(10 ** token0.decimals)
            .toFixed(token0.decimals),
          amount1: BigNumber(res.amountB)
            .div(10 ** token1.decimals)
            .toFixed(token1.decimals),
        },
      }
      this.emitter.emit(ACTIONS.QUOTE_REMOVE_LIQUIDITY_RETURNED, returnVal)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  // createGauge = async (payload) => {
  //   try {
  //     const context = this

  //     const account = stores.accountStore.getStore('account')
  //     if (!account) {
  //       console.warn('account not found')
  //       return null
  //     }

  //     const web3 = await stores.accountStore.getWeb3Provider()
  //     if (!web3) {
  //       console.warn('web3 not found')
  //       return null
  //     }

  //     const { pair } = payload.content

  //     // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
  //     let createGaugeTXID = this.getTXUUID()

  //     this.emitter.emit(ACTIONS.TX_ADDED, {
  //       title: `Create liquidity gauge for ${pair.token0.symbol}/${pair.token1.symbol}`,
  //       type: 'Liquidity',
  //       verb: 'Gauge Created',
  //       transactions: [
  //         {
  //           uuid: createGaugeTXID,
  //           description: `Create gauge`,
  //           status: 'WAITING',
  //         },
  //       ],
  //     })

  //     const gasPrice = await stores.accountStore.getGasPrice()

  //     const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)
  //     this._callContractWait(
  //       web3,
  //       gaugesContract,
  //       'createGauge',
  //       [pair.address],
  //       account,
  //       gasPrice,
  //       null,
  //       null,
  //       createGaugeTXID,
  //       async (err) => {
  //         if (err) {
  //           return this.emitter.emit(ACTIONS.ERROR, err)
  //         }

  //         await this.updatePairsCall(web3, account)

  //         this.emitter.emit(ACTIONS.CREATE_GAUGE_RETURNED)
  //       }
  //     )
  //   } catch (ex) {
  //     console.error(ex)
  //     this.emitter.emit(ACTIONS.ERROR, ex)
  //   }
  // }

  quoteSwap = async (payload) => {
    try {
      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      // some path logic. Have a base asset (ETH) swap from start asset to ETH, swap from ETH back to out asset. Don't know.
      const routeAssets = this.getStore('routeAssets')
      const { fromAsset, toAsset, fromAmount } = payload.content

      const routerContract = new web3.eth.Contract(CONTRACTS.ROUTER_ABI, CONTRACTS.ROUTER_ADDRESS)
      const sendFromAmount = BigNumber(fromAmount)
        .times(10 ** fromAsset.decimals)
        .toFixed()

      if (!fromAsset || !toAsset || !fromAmount || !fromAsset.address || !toAsset.address || fromAmount === '') {
        return null
      }

      let addy0 = fromAsset.address
      let addy1 = toAsset.address

      if (fromAsset.address === 'ETH') {
        addy0 = CONTRACTS.WETH_ADDRESS
      }
      if (toAsset.address === 'ETH') {
        addy1 = CONTRACTS.WETH_ADDRESS
      }

      const includesRouteAddress = routeAssets.filter((asset) => {
        return asset.address.toLowerCase() == addy0.toLowerCase() || asset.address.toLowerCase() == addy1.toLowerCase()
      })

      const filteredRouteAddress = routeAssets.filter((asset) => {
        return (
          asset.address.toLowerCase() !== addy0.toLowerCase() && asset.address.toLowerCase() !== addy1.toLowerCase()
        )
      })

      // By drummaster98
      // Using pairs to filter out routes where the pair does not exist.
      // This is because if the pair for a route does not exist, quoting will result in an error
      // due to division by zero leading to floating-point overflow, especially in stable pools.
      const pairs = this.getStore('pairs')

      if (!pairs) {
        this.emitter.emit(ACTIONS.QUOTE_SWAP_RETURNED, null)
        return null
      }

      const pairExists = (from, to, isStable) => {
        // console.log('Checking pair exists:', from, to, isStable)
        return pairs.some(
          (pair) =>
            (pair.token0_address.toLowerCase() === from.toLowerCase() &&
              pair.token1_address.toLowerCase() === to.toLowerCase() &&
              pair.stable === isStable) ||
            (pair.token0_address.toLowerCase() === to.toLowerCase() &&
              pair.token1_address.toLowerCase() === from.toLowerCase() &&
              pair.stable === isStable)
        )
      }

      let amountOuts = []

      amountOuts = filteredRouteAddress
        .map((routeAsset) => {
          return [
            {
              routes: [
                {
                  from: addy0,
                  to: routeAsset.address,
                  stable: true,
                },
                {
                  from: routeAsset.address,
                  to: addy1,
                  stable: true,
                },
              ],
              routeAsset,
            },
            {
              routes: [
                {
                  from: addy0,
                  to: routeAsset.address,
                  stable: false,
                },
                {
                  from: routeAsset.address,
                  to: addy1,
                  stable: false,
                },
              ],
              routeAsset,
            },
            {
              routes: [
                {
                  from: addy0,
                  to: routeAsset.address,
                  stable: true,
                },
                {
                  from: routeAsset.address,
                  to: addy1,
                  stable: false,
                },
              ],
              routeAsset,
            },
            {
              routes: [
                {
                  from: addy0,
                  to: routeAsset.address,
                  stable: false,
                },
                {
                  from: routeAsset.address,
                  to: addy1,
                  stable: true,
                },
              ],
              routeAsset,
            },
          ]
        })
        .flat()
        .filter((routeGroup) => {
          // Filter out routes where the pair does not exist
          const existsFirstPair = pairExists(
            routeGroup.routes[0].from,
            routeGroup.routes[0].to,
            routeGroup.routes[0].stable
          )
          const existsSecondPair = pairExists(
            routeGroup.routes[1].from,
            routeGroup.routes[1].to,
            routeGroup.routes[0].stable
          )
          return existsFirstPair && existsSecondPair
        })

      amountOuts.push({
        routes: [
          {
            from: addy0,
            to: addy1,
            stable: true,
          },
        ],
        routeAsset: null,
      })

      amountOuts.push({
        routes: [
          {
            from: addy0,
            to: addy1,
            stable: false,
          },
        ],
        routeAsset: null,
      })

      const multicall = await stores.accountStore.getMulticall()
      const receiveAmounts = await multicall.aggregate(
        amountOuts.map((route) => {
          return routerContract.methods.getAmountsOut(sendFromAmount, route.routes)
        })
      )

      for (let i = 0; i < receiveAmounts.length; i++) {
        amountOuts[i].receiveAmounts = receiveAmounts[i]
        amountOuts[i].finalValue = BigNumber(receiveAmounts[i][receiveAmounts[i].length - 1])
          .div(10 ** toAsset.decimals)
          .toFixed(toAsset.decimals)
      }

      const bestAmountOut = amountOuts
        .filter((ret) => {
          return ret != null
        })
        .reduce((best, current) => {
          if (!best) {
            return current
          }
          return BigNumber(best.finalValue).gt(current.finalValue) ? best : current
        }, 0)

      if (!bestAmountOut) {
        this.emitter.emit(ACTIONS.ERROR, 'No valid route found to complete swap')
        return null
      }

      const libraryContract = new web3.eth.Contract(CONTRACTS.LIBRARY_ABI, CONTRACTS.LIBRARY_ADDRESS)
      let totalRatio = 1

      for (let i = 0; i < bestAmountOut.routes.length; i++) {
        let amountIn = bestAmountOut.receiveAmounts[i]
        let amountOut = bestAmountOut.receiveAmounts[i + 1]

        const res = await libraryContract.methods
          .getTradeDiff(
            amountIn,
            bestAmountOut.routes[i].from,
            bestAmountOut.routes[i].to,
            bestAmountOut.routes[i].stable
          )
          .call()

        const ratio = BigNumber(res.b).div(res.a)
        totalRatio = BigNumber(totalRatio).times(ratio).toFixed(18)
      }

      const priceImpact = BigNumber(1).minus(totalRatio).times(100).toFixed(18)

      const returnValue = {
        inputs: {
          fromAmount,
          fromAsset,
          toAsset,
        },
        output: bestAmountOut,
        priceImpact,
      }

      this.emitter.emit(ACTIONS.QUOTE_SWAP_RETURNED, returnValue)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.QUOTE_SWAP_RETURNED, null)
      // this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  swap = async (payload) => {
    try {
      const context = this

      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { fromAsset, toAsset, fromAmount, toAmount, quote, slippage } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let allowanceTXID = this.getTXUUID()
      let swapTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Swap ${fromAsset.symbol} for ${toAsset.symbol}`,
        type: 'Swap',
        verb: 'Swap Successful',
        transactions: [
          {
            uuid: allowanceTXID,
            description: `Checking your ${fromAsset.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: swapTXID,
            description: `Swap ${formatCurrency(fromAmount)} ${fromAsset.symbol} for ${toAsset.symbol}`,
            status: 'WAITING',
          },
        ],
      })

      let allowance = 0

      // CHECK ALLOWANCES AND SET TX DISPLAY
      if (fromAsset.address !== 'ETH') {
        allowance = await this._getSwapAllowance(web3, fromAsset, account)

        if (BigNumber(allowance).lt(fromAmount)) {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowanceTXID,
            description: `Allow the router to spend your ${fromAsset.symbol}`,
          })
        } else {
          this.emitter.emit(ACTIONS.TX_STATUS, {
            uuid: allowanceTXID,
            description: `Allowance on ${fromAsset.symbol} sufficient`,
            status: 'DONE',
          })
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        allowance = MAX_UINT256
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowanceTXID,
          description: `Allowance on ${fromAsset.symbol} sufficient`,
          status: 'DONE',
        })
      }

      const gasPrice = await stores.accountStore.getGasPrice()

      const allowanceCallsPromises = []

      // SUBMIT REQUIRED ALLOWANCE TRANSACTIONS
      if (BigNumber(allowance).lt(fromAmount)) {
        const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, fromAsset.address)

        let fromAmountBn = BigNumber(fromAmount)
          .times(10 ** fromAsset.decimals)
          .toFixed(0)

        const tokenPromise = new Promise((resolve, reject) => {
          context._callContractWait(
            web3,
            tokenContract,
            'approve',
            [CONTRACTS.ROUTER_ADDRESS, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            allowanceTXID,
            (err) => {
              if (err) {
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(tokenPromise)
      }

      const done = await Promise.all(allowanceCallsPromises)

      // SUBMIT SWAP TRANSACTION
      const sendSlippage = BigNumber(100).minus(slippage).div(100)
      const sendFromAmount = BigNumber(fromAmount)
        .times(10 ** fromAsset.decimals)
        .toFixed(0)
      const sendMinAmountOut = BigNumber(quote.output.finalValue)
        .times(10 ** toAsset.decimals)
        .times(sendSlippage)
        .toFixed(0)
      const deadline = '' + moment().add(600, 'seconds').unix()

      const routerContract = new web3.eth.Contract(CONTRACTS.ROUTER_ABI, CONTRACTS.ROUTER_ADDRESS)

      let func = 'swapExactTokensForTokens'
      let params = [sendFromAmount, sendMinAmountOut, quote.output.routes, account.address, deadline]
      let sendValue = null

      if (fromAsset.address === 'ETH') {
        func = 'swapExactETHForTokens'
        params = [sendMinAmountOut, quote.output.routes, account.address, deadline]
        sendValue = sendFromAmount
      }
      if (toAsset.address === 'ETH') {
        func = 'swapExactTokensForETH'
      }

      this._callContractWait(
        web3,
        routerContract,
        func,
        params,
        account,
        gasPrice,
        null,
        null,
        swapTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this._getSpecificAssetInfo(web3, account, fromAsset.address)
          this._getSpecificAssetInfo(web3, account, toAsset.address)
          this.getPairsInfo(web3, account)

          this.emitter.emit(ACTIONS.SWAP_RETURNED)
        },
        null,
        sendValue
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  wrap = async (payload) => {
    try {
      const context = this

      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { fromAsset, toAsset, fromAmount } = payload.content

      const sendFromAmount = BigNumber(fromAmount)
        .times(10 ** fromAsset.decimals)
        .toFixed(0)

      if (fromAsset.address === 'ETH' && toAsset.address.toLowerCase() === CONTRACTS.WETH_ADDRESS.toLowerCase()) {
        // WRAP
        let wrapTXID = this.getTXUUID()

        this.emitter.emit(ACTIONS.TX_ADDED, {
          title: `Wrap ETH`,
          type: 'Wrap',
          verb: 'ETH Wrapped',
          transactions: [
            {
              uuid: wrapTXID,
              description: `Wrapping ${formatCurrency(fromAmount)} ETH`,
              status: 'WAITING',
            },
          ],
        })

        const gasPrice = await stores.accountStore.getGasPrice()
        const wethContract = new web3.eth.Contract(CONTRACTS.WETH_ABI, CONTRACTS.WETH_ADDRESS)

        // SUBMIT WRAP TRANSACTION
        this._callContractWait(
          web3,
          wethContract,
          'deposit',
          [],
          account,
          gasPrice,
          null,
          null,
          wrapTXID,
          (err) => {
            if (err) {
              return this.emitter.emit(ACTIONS.ERROR, err)
            }
            this._getSpecificAssetInfo(web3, account, CONTRACTS.WETH_ADDRESS)
            this.emitter.emit(ACTIONS.WRAP_RETURNED)
          },
          null,
          sendFromAmount
        )
      } else if (
        fromAsset.address.toLowerCase() === CONTRACTS.WETH_ADDRESS.toLowerCase() &&
        toAsset.address === 'ETH'
      ) {
        // UNWRAP
        let unwrapTXID = this.getTXUUID()

        this.emitter.emit(ACTIONS.TX_ADDED, {
          title: `Unwrap WETH`,
          type: 'Unwrap',
          verb: 'WETH Unwrapped',
          transactions: [
            {
              uuid: unwrapTXID,
              description: `Unwrapping ${formatCurrency(fromAmount)} WETH`,
              status: 'WAITING',
            },
          ],
        })

        const gasPrice = await stores.accountStore.getGasPrice()
        const wethContract = new web3.eth.Contract(CONTRACTS.WETH_ABI, CONTRACTS.WETH_ADDRESS)

        // SUBMIT UNWRAP TRANSACTION
        this._callContractWait(
          web3,
          wethContract,
          'withdraw',
          [sendFromAmount],
          account,
          gasPrice,
          null,
          null,
          unwrapTXID,
          (err) => {
            if (err) {
              return this.emitter.emit(ACTIONS.ERROR, err)
            }
            this._getSpecificAssetInfo(web3, account, CONTRACTS.WETH_ADDRESS)
            this.emitter.emit(ACTIONS.WRAP_RETURNED)
          }
        )
      } else {
        this.emitter.emit(ACTIONS.ERROR, 'Not a wrap/unwrap transaction')
      }
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  _getSpecificAssetInfo = async (web3, account, assetAddress) => {
    try {
      const baseAssets = this.getStore('baseAssets')
      if (!baseAssets) {
        console.warn('baseAssets not found')
        return null
      }

      const ba = await Promise.all(
        baseAssets.map(async (asset) => {
          if (asset.address.toLowerCase() === assetAddress.toLowerCase()) {
            if (asset.address === 'ETH') {
              let bal = await web3.eth.getBalance(account.address)
              asset.balance = BigNumber(bal)
                .div(10 ** asset.decimals)
                .toFixed(asset.decimals)
            } else {
              const assetContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, asset.address)

              const [balanceOf] = await Promise.all([assetContract.methods.balanceOf(account.address).call()])

              asset.balance = BigNumber(balanceOf)
                .div(10 ** asset.decimals)
                .toFixed(asset.decimals)
            }
          }

          return asset
        })
      )

      this.setStore({ baseAssets: ba })
      this.emitter.emit(ACTIONS.UPDATED)
    } catch (ex) {
      console.log(ex)
      return null
    }
  }

  _getSwapAllowance = async (web3, token, account) => {
    try {
      const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token.address)
      const allowance = await tokenContract.methods.allowance(account.address, CONTRACTS.ROUTER_ADDRESS).call()
      return BigNumber(allowance)
        .div(10 ** token.decimals)
        .toFixed(token.decimals)
    } catch (ex) {
      console.error(ex)
      return null
    }
  }

  getVestNFTs = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const veToken = this.getStore('veToken')
      const govToken = this.getStore('govToken')

      const vestingContract = new web3.eth.Contract(CONTRACTS.VE_TOKEN_ABI, CONTRACTS.VE_TOKEN_ADDRESS)

      const nftsLength = await vestingContract.methods.balanceOf(account.address).call()
      const totalSupply = await vestingContract.methods.totalSupply().call()
      const arr = Array.from({ length: parseInt(nftsLength) }, (v, i) => i)

      const nfts = await Promise.all(
        arr.map(async (idx) => {
          const tokenIndex = await vestingContract.methods.tokenOfOwnerByIndex(account.address, idx).call()
          const locked = await vestingContract.methods.locked(tokenIndex).call()
          const lockValue = await vestingContract.methods.balanceOfNFT(tokenIndex).call()

          // probably do some decimals math before returning info. Maybe get more info. I don't know what it returns.
          return {
            id: tokenIndex,
            lockEnds: locked.end,
            lockAmount: BigNumber(locked.amount)
              .div(10 ** govToken.decimals)
              .toFixed(govToken.decimals),
            lockValue: BigNumber(lockValue)
              .div(10 ** veToken.decimals)
              .toFixed(veToken.decimals),
            totalSupply: BigNumber(totalSupply)
              .div(10 ** veToken.decimals)
              .toFixed(veToken.decimals),
          }
        })
      )

      this.setStore({ vestNFTs: nfts })
      this.emitter.emit(ACTIONS.VEST_NFTS_RETURNED, nfts)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  createVest = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const govToken = this.getStore('govToken')
      const { amount, unlockTime } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let allowanceTXID = this.getTXUUID()
      let vestTXID = this.getTXUUID()

      const unlockString = moment().add(unlockTime, 'seconds').format('YYYY-MM-DD')

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Vest ${govToken.symbol} until ${unlockString}`,
        type: 'Vest',
        verb: 'Vest Created',
        transactions: [
          {
            uuid: allowanceTXID,
            description: `Checking your ${govToken.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: vestTXID,
            description: `Vesting your tokens`,
            status: 'WAITING',
          },
        ],
      })

      // CHECK ALLOWANCES AND SET TX DISPLAY
      const allowance = await this._getVestAllowance(web3, govToken, account)

      if (BigNumber(allowance).lt(amount)) {
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowanceTXID,
          description: `Allow the vesting contract to use your ${govToken.symbol}`,
        })
      } else {
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowanceTXID,
          description: `Allowance on ${govToken.symbol} sufficient`,
          status: 'DONE',
        })
      }

      const gasPrice = await stores.accountStore.getGasPrice()

      const allowanceCallsPromises = []

      // SUBMIT REQUIRED ALLOWANCE TRANSACTIONS
      if (BigNumber(allowance).lt(amount)) {
        const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, govToken.address)

        let amountBn = BigNumber(amount)
          .times(10 ** govToken.decimals)
          .toFixed(0)

        const tokenPromise = new Promise((resolve, reject) => {
          this._callContractWait(
            web3,
            tokenContract,
            'approve',
            [CONTRACTS.VE_TOKEN_ADDRESS, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            allowanceTXID,
            (err) => {
              if (err) {
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(tokenPromise)
      }

      const done = await Promise.all(allowanceCallsPromises)

      // SUBMIT VEST TRANSACTION
      const sendAmount = BigNumber(amount)
        .times(10 ** govToken.decimals)
        .toFixed(0)

      const veTokenContract = new web3.eth.Contract(CONTRACTS.VE_TOKEN_ABI, CONTRACTS.VE_TOKEN_ADDRESS)

      this._callContractWait(
        web3,
        veTokenContract,
        'create_lock',
        [sendAmount, unlockTime + ''],
        account,
        gasPrice,
        null,
        null,
        vestTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this._getGovTokenInfo(web3, account)
          this.getNFTByID('fetchAll')

          this.emitter.emit(ACTIONS.CREATE_VEST_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  _getVestAllowance = async (web3, token, account) => {
    try {
      const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token.address)
      const allowance = await tokenContract.methods.allowance(account.address, CONTRACTS.VE_TOKEN_ADDRESS).call()
      return BigNumber(allowance)
        .div(10 ** token.decimals)
        .toFixed(token.decimals)
    } catch (ex) {
      console.error(ex)
      return null
    }
  }

  increaseVestAmount = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const govToken = this.getStore('govToken')
      const { amount, tokenID } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let allowanceTXID = this.getTXUUID()
      let vestTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Increase vest amount on NFT #${tokenID}`,
        type: 'Vest',
        verb: 'Vest Increased',
        transactions: [
          {
            uuid: allowanceTXID,
            description: `Checking your ${govToken.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: vestTXID,
            description: `Increasing your vest amount`,
            status: 'WAITING',
          },
        ],
      })

      // CHECK ALLOWANCES AND SET TX DISPLAY
      const allowance = await this._getVestAllowance(web3, govToken, account)

      if (BigNumber(allowance).lt(amount)) {
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowanceTXID,
          description: `Allow vesting contract to use your ${govToken.symbol}`,
        })
      } else {
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowanceTXID,
          description: `Allowance on ${govToken.symbol} sufficient`,
          status: 'DONE',
        })
      }

      const gasPrice = await stores.accountStore.getGasPrice()

      const allowanceCallsPromises = []

      // SUBMIT REQUIRED ALLOWANCE TRANSACTIONS
      if (BigNumber(allowance).lt(amount)) {
        const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, govToken.address)

        let amountBn = BigNumber(amount)
          .times(10 ** govToken.decimals)
          .toFixed(0)

        const tokenPromise = new Promise((resolve, reject) => {
          this._callContractWait(
            web3,
            tokenContract,
            'approve',
            [CONTRACTS.VE_TOKEN_ADDRESS, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            allowanceTXID,
            (err) => {
              if (err) {
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(tokenPromise)
      }

      const done = await Promise.all(allowanceCallsPromises)

      // SUBMIT INCREASE TRANSACTION
      const sendAmount = BigNumber(amount)
        .times(10 ** govToken.decimals)
        .toFixed(0)

      const veTokenContract = new web3.eth.Contract(CONTRACTS.VE_TOKEN_ABI, CONTRACTS.VE_TOKEN_ADDRESS)

      this._callContractWait(
        web3,
        veTokenContract,
        'increase_amount',
        [tokenID, sendAmount],
        account,
        gasPrice,
        null,
        null,
        vestTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this._getGovTokenInfo(web3, account)
          this._updateVestNFTByID(tokenID)

          this.emitter.emit(ACTIONS.INCREASE_VEST_AMOUNT_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  increaseVestDuration = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const govToken = this.getStore('govToken')
      const { tokenID, unlockTime } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let vestTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Increase unlock time on NFT #${tokenID}`,
        type: 'Vest',
        verb: 'Vest Increased',
        transactions: [
          {
            uuid: vestTXID,
            description: `Increasing your vest duration`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT INCREASE TRANSACTION
      const veTokenContract = new web3.eth.Contract(CONTRACTS.VE_TOKEN_ABI, CONTRACTS.VE_TOKEN_ADDRESS)

      this._callContractWait(
        web3,
        veTokenContract,
        'increase_unlock_time',
        [tokenID, unlockTime + ''],
        account,
        gasPrice,
        null,
        null,
        vestTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this._updateVestNFTByID(tokenID)

          this.emitter.emit(ACTIONS.INCREASE_VEST_DURATION_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  maxVestDuration = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const govToken = this.getStore('govToken')
      const { nftId, unlockTime } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let vestTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Maximize unlock time on NFT #${nftId}`,
        type: 'Vest',
        verb: 'Vest Maximized',
        transactions: [
          {
            uuid: vestTXID,
            description: `Maximizing your vest duration`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT INCREASE TRANSACTION
      const veTokenContract = new web3.eth.Contract(CONTRACTS.VE_TOKEN_ABI, CONTRACTS.VE_TOKEN_ADDRESS)

      this._callContractWait(
        web3,
        veTokenContract,
        'increase_unlock_time',
        [nftId, unlockTime + ''],
        account,
        gasPrice,
        null,
        null,
        vestTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this._updateVestNFTByID(nftId)

          this.emitter.emit(ACTIONS.MAX_VEST_DURATION_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  withdrawVest = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const govToken = this.getStore('govToken')
      const { tokenID } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let vestTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Withdraw vest amount on NFT #${tokenID}`,
        type: 'Vest',
        verb: 'Vest Withdrawn',
        transactions: [
          {
            uuid: vestTXID,
            description: `Withdrawing your expired tokens`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT INCREASE TRANSACTION
      const veTokenContract = new web3.eth.Contract(CONTRACTS.VE_TOKEN_ABI, CONTRACTS.VE_TOKEN_ADDRESS)

      this._callContractWait(
        web3,
        veTokenContract,
        'withdraw',
        [tokenID],
        account,
        gasPrice,
        null,
        null,
        vestTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this._updateVestNFTByID(tokenID)

          this.emitter.emit(ACTIONS.WITHDRAW_VEST_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  mergeVest = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      // const govToken = this.getStore('govToken')
      const { fromNftId, toNftId } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let vestTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Merge #${fromNftId} into #${toNftId}`,
        type: 'Vest',
        verb: 'Vest Merged',
        transactions: [
          {
            uuid: vestTXID,
            description: `Merging #${fromNftId} into #${toNftId}`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT MERGE TRANSACTION
      const veTokenContract = new web3.eth.Contract(CONTRACTS.VE_TOKEN_ABI, CONTRACTS.VE_TOKEN_ADDRESS)

      this._callContractWait(
        web3,
        veTokenContract,
        'merge',
        [fromNftId, toNftId],
        account,
        gasPrice,
        null,
        null,
        vestTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this._removeVestNFTByID(fromNftId)
          this._updateVestNFTByID(toNftId)

          this.emitter.emit(ACTIONS.MERGE_VEST_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  transferVest = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      // const govToken = this.getStore('govToken')
      const { nftId, address } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let vestTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Transfer NFT #${nftId} to ${formatAddress(address, 'ultraShort')}`,
        type: 'Vest',
        verb: 'Vest Transfered',
        transactions: [
          {
            uuid: vestTXID,
            description: `Transfering NFT #${nftId} to ${formatAddress(address, 'ultraShort')}`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT MERGE TRANSACTION
      const veTokenContract = new web3.eth.Contract(CONTRACTS.VE_TOKEN_ABI, CONTRACTS.VE_TOKEN_ADDRESS)

      this._callContractWait(
        web3,
        veTokenContract,
        'transferFrom',
        [account.address, address, nftId],
        account,
        gasPrice,
        null,
        null,
        vestTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this._removeVestNFTByID(nftId)

          this.emitter.emit(ACTIONS.TRANSFER_VEST_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  resetVest = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      // const govToken = this.getStore('govToken')
      const { nftId } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let vestTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Reset NFT #${nftId}'s votes`,
        type: 'Vest',
        verb: 'Vest Reset',
        transactions: [
          {
            uuid: vestTXID,
            description: `Resetting NFT #${nftId}'s votes`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT MERGE TRANSACTION
      const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)

      this._callContractWait(web3, gaugesContract, 'reset', [nftId], account, gasPrice, null, null, vestTXID, (err) => {
        if (err) {
          return this.emitter.emit(ACTIONS.ERROR, err)
        }

        this.emitter.emit(ACTIONS.RESET_VEST_RETURNED)
      })
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  pokeVest = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      // const govToken = this.getStore('govToken')
      const { nftId } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let vestTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Poke NFT #${nftId}'s votes`,
        type: 'Vest',
        verb: 'Vest Poked',
        transactions: [
          {
            uuid: vestTXID,
            description: `Poking NFT #${nftId}'s votes`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT MERGE TRANSACTION
      const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)

      this._callContractWait(web3, gaugesContract, 'poke', [nftId], account, gasPrice, null, null, vestTXID, (err) => {
        if (err) {
          return this.emitter.emit(ACTIONS.ERROR, err)
        }

        this.emitter.emit(ACTIONS.POKE_VEST_RETURNED)
      })
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  getStartTime = async () => {
    try {
      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      let veStartTime = this.getStore('veStartTime')

      if (!veStartTime) {
        const veDistContract = new web3.eth.Contract(CONTRACTS.VE_DIST_ABI, CONTRACTS.VE_DIST_ADDRESS)
        veStartTime = await veDistContract.methods.start_time().call()

        this.setStore({ veStartTime })
      }

      return veStartTime
    } catch (ex) {
      console.error(ex)
      return null
    }
  }

  vote = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const govToken = this.getStore('govToken')
      const { tokenID, votes } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let voteTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Cast vote using NFT #${tokenID}`,
        verb: 'Votes Cast',
        transactions: [
          {
            uuid: voteTXID,
            description: `Cast votes`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT INCREASE TRANSACTION
      const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)

      let onlyVotes = votes.filter((vote) => {
        return BigNumber(vote.value).gt(0) || BigNumber(vote.value).lt(0)
      })

      let tokens = onlyVotes.map((vote) => {
        return vote.address
      })

      let voteCounts = onlyVotes.map((vote) => {
        return BigNumber(vote.value).times(100).toFixed(0)
      })

      this._callContractWait(
        web3,
        gaugesContract,
        'vote',
        [tokenID, tokens, voteCounts],
        account,
        gasPrice,
        null,
        null,
        voteTXID,
        (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this.emitter.emit(ACTIONS.VOTE_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  getVestVotes = async (payload) => {
    try {
      // const account = stores.accountStore.getStore('account')
      // if (!account) {
      //   console.warn('account not found')
      //   return null
      // }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { tokenID } = payload.content
      const pairs = this.getStore('pairs')

      if (!pairs) {
        return null
      }

      if (!tokenID) {
        return
      }

      const filteredPairs = pairs.filter((pair) => {
        return pair && pair.gauge && pair.gauge.address
      })

      const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)

      const multicall = await stores.accountStore.getMulticall()

      const calls = filteredPairs.map((pair) => {
        return gaugesContract.methods.votes(tokenID, pair.address)
      })

      const voteCounts = await multicall.aggregate(calls)

      let votes = []

      const totalVotes = voteCounts.reduce((curr, acc) => {
        let num = BigNumber(acc).gt(0) ? acc : BigNumber(acc).times(-1).toNumber(0)
        return BigNumber(curr).plus(num)
      }, 0)

      for (let i = 0; i < voteCounts.length; i++) {
        votes.push({
          address: filteredPairs[i].address,
          votePercent:
            BigNumber(totalVotes).gt(0) || BigNumber(totalVotes).lt(0)
              ? BigNumber(voteCounts[i]).times(100).div(totalVotes).toFixed(0)
              : '0',
        })
      }

      this.emitter.emit(ACTIONS.VEST_VOTES_RETURNED, votes)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  getVestVotesAll = async (payload) => {
    try {
      console.log('getVestVotesAll')
      // const account = stores.accountStore.getStore('account')
      // if (!account) {
      //   console.warn('account not found')
      //   return null
      // }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { nfts } = payload.content
      const pairs = this.getStore('pairs')

      if (!pairs) {
        return null
      }

      if (!nfts || nfts.length === 0) {
        return
      }

      const filteredPairs = pairs.filter((pair) => {
        return pair && pair.gauge && pair.gauge.address
      })

      const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)

      const multicall = await stores.accountStore.getMulticall()

      let votesMap = {}

      for (let i = 0; i < nfts.length; i++) {
        const calls = filteredPairs.map((pair) => {
          return gaugesContract.methods.votes(nfts[i].id, pair.address)
        })

        const voteCounts = await multicall.aggregate(calls)

        let votes = []

        const totalVotes = voteCounts.reduce((curr, acc) => {
          let num = BigNumber(acc).gt(0) ? acc : BigNumber(acc).times(-1).toNumber(0)
          return BigNumber(curr).plus(num)
        }, 0)

        for (let i = 0; i < voteCounts.length; i++) {
          votes.push({
            address: filteredPairs[i].address,
            votePercent:
              BigNumber(totalVotes).gt(0) || BigNumber(totalVotes).lt(0)
                ? BigNumber(voteCounts[i]).times(100).div(totalVotes).toFixed(0)
                : '0',
          })
        }

        votesMap[nfts[i].id] = votes
      }

      console.log('votesMap', votesMap)

      this.emitter.emit(ACTIONS.VEST_VOTES_ALL_RETURNED, votesMap)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  createBribe = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { asset, amount, gauge } = payload.content // in fact, gauge is a pair

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let allowanceTXID = this.getTXUUID()
      let bribeTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Create bribe on ${gauge.token0.symbol}/${gauge.token1.symbol}`,
        verb: 'Bribe Created',
        transactions: [
          {
            uuid: allowanceTXID,
            description: `Checking your ${asset.symbol} allowance`,
            status: 'WAITING',
          },
          {
            uuid: bribeTXID,
            description: `Create bribe`,
            status: 'WAITING',
          },
        ],
      })

      // CHECK ALLOWANCES AND SET TX DISPLAY
      const allowance = await this._getBribeAllowance(web3, asset, gauge, account)

      if (BigNumber(allowance).lt(amount)) {
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowanceTXID,
          description: `Allow the bribe contract to spend your ${asset.symbol}`,
        })
      } else {
        this.emitter.emit(ACTIONS.TX_STATUS, {
          uuid: allowanceTXID,
          description: `Allowance on ${asset.symbol} sufficient`,
          status: 'DONE',
        })
      }

      const gasPrice = await stores.accountStore.getGasPrice()

      const allowanceCallsPromises = []

      // SUBMIT REQUIRED ALLOWANCE TRANSACTIONS
      if (BigNumber(allowance).lt(amount)) {
        const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, asset.address)

        let amountBn = BigNumber(amount)
          .times(10 ** asset.decimals)
          .toFixed(0)

        const tokenPromise = new Promise((resolve, reject) => {
          this._callContractWait(
            web3,
            tokenContract,
            'approve',
            [gauge.gauge.bribeAddress, MAX_UINT256],
            account,
            gasPrice,
            null,
            null,
            allowanceTXID,
            (err) => {
              if (err) {
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        allowanceCallsPromises.push(tokenPromise)
      }

      const done = await Promise.all(allowanceCallsPromises)

      // SUBMIT BRIBE TRANSACTION
      const bribeContract = new web3.eth.Contract(CONTRACTS.BRIBE_ABI, gauge.gauge.bribeAddress)

      const sendAmount = BigNumber(amount)
        .times(10 ** asset.decimals)
        .toFixed(0)

      this._callContractWait(
        web3,
        bribeContract,
        'notifyRewardAmount',
        [asset.address, sendAmount],
        account,
        gasPrice,
        null,
        null,
        bribeTXID,
        async (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          await this.updatePairsCall(web3, account, gauge.address) // in fact, gauge is a pair

          this.emitter.emit(ACTIONS.BRIBE_CREATED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  _getBribeAllowance = async (web3, token, pair, account) => {
    try {
      const tokenContract = new web3.eth.Contract(CONTRACTS.ERC20_ABI, token.address)
      const allowance = await tokenContract.methods.allowance(account.address, pair.gauge.bribeAddress).call()
      return BigNumber(allowance)
        .div(10 ** token.decimals)
        .toFixed(token.decimals)
    } catch (ex) {
      console.error(ex)
      return null
    }
  }

  getVestBalances = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { tokenID } = payload.content
      const pairs = this.getStore('pairs')

      if (!pairs) {
        return null
      }

      if (!tokenID) {
        return
      }

      const filteredPairs = pairs.filter((pair) => {
        return pair && pair.gauge
      })

      const bribesEarned = await Promise.all(
        filteredPairs.map(async (pair) => {
          const bribesEarned = await Promise.all(
            pair.gauge.bribes.map(async (bribe) => {
              const bribeContract = new web3.eth.Contract(CONTRACTS.BRIBE_ABI, pair.gauge.bribeAddress)

              const [earned] = await Promise.all([bribeContract.methods.earned(bribe.token.address, tokenID).call()])

              return {
                earned: BigNumber(earned)
                  .div(10 ** bribe.token.decimals)
                  .toFixed(bribe.token.decimals),
              }
            })
          )

          pair.gauge.bribesEarned = bribesEarned

          return pair
        })
      )

      this.emitter.emit(ACTIONS.VEST_BALANCES_RETURNED, bribesEarned)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  getRewardBalances = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { tokenID } = payload.content

      const pairs = this.getStore('pairs')
      const veToken = this.getStore('veToken')
      const govToken = this.getStore('govToken')

      const filteredPairs = [
        ...pairs.filter((pair) => {
          return pair && pair.gauge
        }),
      ]

      const filteredPairs2 = [
        ...pairs.filter((pair) => {
          return pair && pair.gauge
        }),
      ]

      let veDistReward = []

      let filteredBribes = []

      if (tokenID) {
        // reward: External + Internal Bribes
        const bribesEarned = await Promise.all(
          filteredPairs.map(async (pair) => {
            const bribesEarned = await Promise.all(
              pair.gauge.bribes.map(async (bribe) => {
                const bribeContract = new web3.eth.Contract(CONTRACTS.BRIBE_ABI, pair.gauge.bribeAddress)
                const [bribeEarned] = await Promise.all([
                  bribeContract.methods.earned(bribe.token.address, tokenID).call(),
                ])

                const feesContract = new web3.eth.Contract(CONTRACTS.FEES_ABI, pair.gauge.feesAddress)
                const [feesEarned] = await Promise.all([
                  feesContract.methods.earned(bribe.token.address, tokenID).call(),
                ])

                bribe.earned = BigNumber(bribeEarned)
                  .plus(feesEarned)
                  .div(10 ** bribe.token.decimals)
                  .toFixed(bribe.token.decimals)
                return bribe
              })
            ).filter((bribe) => BigNumber(bribe.earned).gt(0))

            pair.gauge.bribesEarned = bribesEarned

            return pair
          })
        )

        filteredBribes = bribesEarned
          .filter((pair) => pair.gauge && pair.gauge.bribesEarned && pair.gauge.bribesEarned.length > 0)
          .map((pair) => {
            pair.rewardType = 'Bribe'
            return pair
          })

        // reward: KODO Rebase
        const veDistContract = new web3.eth.Contract(CONTRACTS.VE_DIST_ABI, CONTRACTS.VE_DIST_ADDRESS)
        const veDistEarned = await veDistContract.methods.claimable(tokenID).call()
        const vestNFTs = this.getStore('vestNFTs')
        let theNFT = vestNFTs.filter((vestNFT) => {
          return vestNFT.id == tokenID
        })

        if (BigNumber(veDistEarned).gt(0)) {
          veDistReward.push({
            token: theNFT[0],
            lockToken: veToken,
            rewardToken: govToken,
            earned: BigNumber(veDistEarned)
              .div(10 ** govToken.decimals)
              .toFixed(govToken.decimals),
            rewardType: 'Distribution',
          })
        }
      }

      // reward: LP fees
      const filteredFees = []
      for (let i = 0; i < pairs.length; i++) {
        let pair = Object.assign({}, pairs[i])
        if (BigNumber(pair.claimable0).gt(0) || BigNumber(pair.claimable1).gt(0)) {
          pair.rewardType = 'Fees'
          filteredFees.push(pair)
        }
      }

      // reward: KODO emmission
      const rewardsEarned = await Promise.all(
        filteredPairs2.map(async (pair) => {
          const gaugeContract = new web3.eth.Contract(CONTRACTS.GAUGE_ABI, pair.gauge.address)

          const [earned] = await Promise.all([
            gaugeContract.methods.earned(CONTRACTS.GOV_TOKEN_ADDRESS, account.address).call(),
          ])

          pair.gauge.rewardsEarned = BigNumber(earned)
            .div(10 ** 18)
            .toFixed(18)
          return pair
        })
      )

      const filteredRewards = []
      for (let j = 0; j < rewardsEarned.length; j++) {
        let pair = Object.assign({}, rewardsEarned[j])
        if (pair.gauge && pair.gauge.rewardsEarned && BigNumber(pair.gauge.rewardsEarned).gt(0)) {
          pair.rewardType = 'Reward'
          filteredRewards.push(pair)
        }
      }

      const rewards = {
        bribes: filteredBribes,
        fees: filteredFees,
        rewards: filteredRewards,
        veDist: veDistReward,
      }

      this.setStore({
        rewards,
      })

      this.emitter.emit(ACTIONS.REWARD_BALANCES_RETURNED, rewards)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  getRewardBalancesALL = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const pairs = this.getStore('pairs')
      const veToken = this.getStore('veToken')
      const govToken = this.getStore('govToken')

      const vestNFTs = this.getStore('vestNFTs')

      let nftSpecificRewards = []

      // iterate vestNFTs
      for (let i = 0; i < vestNFTs.length; i++) {
        let theNFT = vestNFTs[i]
        let tokenID = theNFT.id

        //ここで新しいペア配列が作成されます
        const filteredPairs = [
          ...pairs.filter((pair) => {
            return pair && pair.gauge
          }),
        ]

        let veDistReward = []
        let filteredBribes = []

        // reward: External + Internal Bribes
        const bribesEarned = await Promise.all(
          filteredPairs.map(async (originalPair) => {
            let pair = { ...originalPair }
            const bribes = await Promise.all(
              pair.gauge.bribes.map(async (originalBribe) => {
                let bribe = { ...originalBribe }
                const bribeContract = new web3.eth.Contract(CONTRACTS.BRIBE_ABI, pair.gauge.bribeAddress)
                const [bribeEarned] = await Promise.all([
                  bribeContract.methods.earned(bribe.token.address, tokenID).call(),
                ])

                const feesContract = new web3.eth.Contract(CONTRACTS.FEES_ABI, pair.gauge.feesAddress)
                const [feesEarned] = await Promise.all([
                  feesContract.methods.earned(bribe.token.address, tokenID).call(),
                ])

                bribe.earned = BigNumber(bribeEarned)
                  .plus(feesEarned)
                  .div(10 ** bribe.token.decimals)
                  .toFixed(bribe.token.decimals)
                bribe.nftid = tokenID
                return bribe
              })
            )
            const bribesEarned = bribes.filter((bribe) => BigNumber(bribe.earned).gt(0))
            pair.gauge = { ...pair.gauge }
            pair.gauge.bribesEarned = bribesEarned

            return pair
          })
        )

        filteredBribes = bribesEarned
          .filter((pair) => pair.gauge && pair.gauge.bribesEarned && pair.gauge.bribesEarned.length > 0)
          .map((pair) => {
            pair.rewardType = 'Bribe'
            return pair
          })

        // reward: KODO Rebase
        const veDistContract = new web3.eth.Contract(CONTRACTS.VE_DIST_ABI, CONTRACTS.VE_DIST_ADDRESS)
        const veDistEarned = await veDistContract.methods.claimable(tokenID).call()

        if (BigNumber(veDistEarned).gt(0)) {
          veDistReward.push({
            token: theNFT,
            lockToken: veToken,
            rewardToken: govToken,
            earned: BigNumber(veDistEarned)
              .div(10 ** govToken.decimals)
              .toFixed(govToken.decimals),
            rewardType: 'Distribution',
          })
        }

        nftSpecificRewards.push({
          nft: theNFT,
          bribes: filteredBribes,
          veDist: veDistReward,
        })
      }

      // reward: LP fees
      const filteredFees = []
      for (let i = 0; i < pairs.length; i++) {
        let pair = Object.assign({}, pairs[i])
        if (BigNumber(pair.claimable0).gt(0) || BigNumber(pair.claimable1).gt(0)) {
          pair.rewardType = 'Fees'
          filteredFees.push(pair)
        }
      }

      const filteredPairs2 = [
        ...pairs.filter((pair) => {
          return pair && pair.gauge
        }),
      ]

      // reward: KODO emmission
      const rewardsEarned = await Promise.all(
        filteredPairs2.map(async (originalPair) => {
          let pair = { ...originalPair }
          const gaugeContract = new web3.eth.Contract(CONTRACTS.GAUGE_ABI, pair.gauge.address)

          const [earned] = await Promise.all([
            gaugeContract.methods.earned(CONTRACTS.GOV_TOKEN_ADDRESS, account.address).call(),
          ])

          pair.gauge = { ...pair.gauge }
          pair.gauge.rewardsEarned = BigNumber(earned)
            .div(10 ** 18)
            .toFixed(18)
          return pair
        })
      )

      const filteredRewards = []
      for (let j = 0; j < rewardsEarned.length; j++) {
        let pair = rewardsEarned[j]
        if (pair.gauge && pair.gauge.rewardsEarned && BigNumber(pair.gauge.rewardsEarned).gt(0)) {
          pair.rewardType = 'Reward'
          filteredRewards.push(pair)
        }
      }

      const rewardsAll = {
        fees: filteredFees, // address-wise
        rewards: filteredRewards, // address-wise
        nftRewards: nftSpecificRewards, // nft-wise
      }

      console.log('rewardsAll', rewardsAll)

      this.setStore({
        rewardsAll,
      })

      this.emitter.emit(ACTIONS.REWARD_BALANCES_ALL_RETURNED, rewardsAll)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  claimAllRewards = async (payload) => {
    try {
      const context = this
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { pairs, tokenID } = payload.content

      console.log('pairs', pairs)
      console.log('tokenID', tokenID)

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let internalBribesClaimTXID = this.getTXUUID() // Incentive Fees
      let externalBribesClaimTXID = this.getTXUUID() // Incentive Bribes
      let lpFeeClaimTXIDs = []
      let rewardClaimTXIDs = []
      let distributionClaimTXIDs = []

      let bribesPairs = pairs.filter((pair) => {
        return pair.rewardType === 'Bribe' && pair.gauge.bribesEarned.length > 0
      })

      // let externalBribesPairs = pairs.filter((pair) => {
      //   return pair.rewardType === 'Bribe' && pair.gauge.bribesEarned.length > 0
      // })

      let lpFeesPairs = pairs.filter((pair) => {
        return pair.rewardType === 'Fees'
      })

      // Emissions
      let rewardPairs = pairs.filter((pair) => {
        return pair.rewardType === 'Reward'
      })

      // Rebases
      let distribution = pairs.filter((pair) => {
        return pair.rewardType === 'Distribution'
      })

      if (bribesPairs.length == 0 && lpFeesPairs.length == 0 && rewardPairs.length == 0 && distribution.length == 0) {
        this.emitter.emit(ACTIONS.ERROR, 'Nothing to claim')
        this.emitter.emit(ACTIONS.CLAIM_ALL_REWARDS_RETURNED)
        return
      }

      let sendOBJ = {
        title: `Claim all rewards`,
        verb: 'Rewards Claimed',
        transactions: [],
      }

      if (bribesPairs.length > 0) {
        sendOBJ.transactions.push({
          uuid: internalBribesClaimTXID,
          description: `Claiming all your available incentive fees`,
          status: 'WAITING',
        })

        sendOBJ.transactions.push({
          uuid: externalBribesClaimTXID,
          description: `Claiming all your available bribes`,
          status: 'WAITING',
        })
      }

      if (lpFeesPairs.length > 0) {
        for (let i = 0; i < lpFeesPairs.length; i++) {
          const newClaimTX = this.getTXUUID()

          lpFeeClaimTXIDs.push(newClaimTX)
          sendOBJ.transactions.push({
            uuid: newClaimTX,
            description: `Claiming LP fees for ${lpFeesPairs[i].symbol}`,
            status: 'WAITING',
          })
        }
      }

      if (rewardPairs.length > 0) {
        for (let i = 0; i < rewardPairs.length; i++) {
          const newClaimTX = this.getTXUUID()

          rewardClaimTXIDs.push(newClaimTX)
          sendOBJ.transactions.push({
            uuid: newClaimTX,
            description: `Claiming emission reward for ${rewardPairs[i].symbol}`,
            status: 'WAITING',
          })
        }
      }

      if (distribution.length > 0) {
        for (let i = 0; i < distribution.length; i++) {
          const newClaimTX = this.getTXUUID()

          distributionClaimTXIDs.push(newClaimTX)
          sendOBJ.transactions.push({
            uuid: newClaimTX,
            description: `Claiming KODO rebase for NFT #${distribution[i].token.id}`,
            status: 'WAITING',
          })
        }
      }

      this.emitter.emit(ACTIONS.TX_ADDED, sendOBJ)

      const gasPrice = await stores.accountStore.getGasPrice()

      // const sendGauges = bribePairs.map((pair) => {
      //   return pair.gauge.bribeAddress
      // })
      const internalBribeGauges = bribesPairs.map((pair) => {
        return pair.gauge.feesAddress
      })
      const internalSendTokens = bribesPairs.map((pair) => {
        return [pair.token0.address, pair.token1.address]
      })

      const externalBribeGauges = bribesPairs.map((pair) => {
        return pair.gauge.bribeAddress
      })
      const externalSendTokens = bribesPairs.map((pair) => {
        return pair.gauge.bribesEarned.map((bribe) => {
          return bribe.token.address
        })
      })

      if (bribesPairs.length > 0) {
        // SUBMIT CLAIM TRANSACTION
        const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)

        const claimInternalBribePromise = new Promise((resolve, reject) => {
          context._callContractWait(
            web3,
            gaugesContract,
            'claimFees',
            [internalBribeGauges, internalSendTokens, tokenID],
            account,
            gasPrice,
            null,
            null,
            internalBribesClaimTXID,
            (err) => {
              if (err) {
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        await Promise.all([claimInternalBribePromise])

        const claimExternalBribePromise = new Promise((resolve, reject) => {
          context._callContractWait(
            web3,
            gaugesContract,
            'claimBribes',
            [externalBribeGauges, externalSendTokens, tokenID],
            account,
            gasPrice,
            null,
            null,
            externalBribesClaimTXID,
            (err) => {
              if (err) {
                reject(err)
                return
              }

              resolve()
            }
          )
        })

        await Promise.all([claimExternalBribePromise])
      }

      if (lpFeesPairs.length > 0) {
        let promises = []
        for (let i = 0; i < lpFeesPairs.length; i++) {
          const pairContract = new web3.eth.Contract(CONTRACTS.PAIR_ABI, lpFeesPairs[i].address)

          const claimPromise = new Promise((resolve, reject) => {
            context._callContractWait(
              web3,
              pairContract,
              'claimFees',
              [],
              account,
              gasPrice,
              null,
              null,
              lpFeeClaimTXIDs[i],
              (err) => {
                if (err) {
                  reject(err)
                  return
                }

                resolve()
              }
            )
          })

          promises.push(claimPromise)
        }
        await Promise.all(promises)
      }

      if (rewardPairs.length > 0) {
        let promises = []
        for (let i = 0; i < rewardPairs.length; i++) {
          const gaugeContract = new web3.eth.Contract(CONTRACTS.GAUGE_ABI, rewardPairs[i].gauge.address)
          const sendTok = [CONTRACTS.GOV_TOKEN_ADDRESS]

          const rewardPromise = new Promise((resolve, reject) => {
            context._callContractWait(
              web3,
              gaugeContract,
              'getReward',
              [account.address, sendTok],
              account,
              gasPrice,
              null,
              null,
              rewardClaimTXIDs[i],
              (err) => {
                if (err) {
                  reject(err)
                  return
                }

                resolve()
              }
            )
          })

          promises.push(rewardPromise)
        }
        await Promise.all(promises)
      }

      if (distribution.length > 0) {
        const veDistContract = new web3.eth.Contract(CONTRACTS.VE_DIST_ABI, CONTRACTS.VE_DIST_ADDRESS)
        for (let i = 0; i < distribution.length; i++) {
          const rewardPromise = new Promise((resolve, reject) => {
            context._callContractWait(
              web3,
              veDistContract,
              'claim',
              [tokenID],
              account,
              gasPrice,
              null,
              null,
              distributionClaimTXIDs[i],
              (err) => {
                if (err) {
                  reject(err)
                  return
                }

                resolve()
              }
            )
          })

          await Promise.all([rewardPromise])
        }
      }

      this.getRewardBalancesALL()
      this.emitter.emit(ACTIONS.CLAIM_ALL_REWARDS_RETURNED)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  claimBribes = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { pair, tokenID } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let claimFeesTXID = this.getTXUUID()
      let claimBribesTXID = this.getTXUUID()

      let sendOBJ = {
        title: `Claim bribes for ${pair.token0.symbol}/${pair.token1.symbol}`,
        verb: 'Bribes Claimed',
        transactions: [],
      }

      sendOBJ.transactions.push({
        uuid: claimFeesTXID,
        description: `Claiming internal bribes (incentive fees)`,
        status: 'WAITING',
      })

      sendOBJ.transactions.push({
        uuid: claimBribesTXID,
        description: `Claiming external bribes`,
        status: 'WAITING',
      })

      this.emitter.emit(ACTIONS.TX_ADDED, sendOBJ)

      const gasPrice = await stores.accountStore.getGasPrice()
      const gaugesContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)
      const sendTokens = [
        pair.gauge.bribesEarned.map((bribe) => {
          return bribe.token.address
        }),
      ]

      // Incentive fees
      const feeGauges = [pair.gauge.feesAddress]

      const claimFeesPromise = new Promise((resolve, reject) => {
        this._callContractWait(
          web3,
          gaugesContract,
          'claimFees',
          [feeGauges, sendTokens, tokenID],
          account,
          gasPrice,
          null,
          null,
          claimFeesTXID,
          (err) => {
            if (err) {
              reject(err)
              return
            }

            resolve()
          }
        )
      })

      await Promise.all([claimFeesPromise])

      // Bribes
      const bribeGauges = [pair.gauge.bribeAddress]

      const claimBribePromise = new Promise((resolve, reject) => {
        this._callContractWait(
          web3,
          gaugesContract,
          'claimBribes',
          [bribeGauges, sendTokens, tokenID],
          account,
          gasPrice,
          null,
          null,
          claimBribesTXID,
          (err) => {
            if (err) {
              reject(err)
              return
            }

            resolve()
          }
        )
      })

      await Promise.all([claimBribePromise])

      this.getRewardBalancesALL()
      this.emitter.emit(ACTIONS.CLAIM_REWARD_RETURNED)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  claimRewards = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { pair, tokenID } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let claimTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Claim emission rewards for ${pair.token0.symbol}/${pair.token1.symbol}`,
        verb: 'Emission Rewards Claimed',
        transactions: [
          {
            uuid: claimTXID,
            description: `Claiming your emission rewards`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT CLAIM TRANSACTION
      const gaugeContract = new web3.eth.Contract(CONTRACTS.GAUGE_ABI, pair.gauge.address)

      const sendTokens = [CONTRACTS.GOV_TOKEN_ADDRESS]

      this._callContractWait(
        web3,
        gaugeContract,
        'getReward',
        [account.address, sendTokens],
        account,
        gasPrice,
        null,
        null,
        claimTXID,
        async (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this.getRewardBalancesALL()
          this.emitter.emit(ACTIONS.CLAIM_REWARD_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  claimVeDist = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { tokenID } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let claimTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Claim KODO rebase for NFT #${tokenID}`,
        verb: 'KODO Rebase Claimed',
        transactions: [
          {
            uuid: claimTXID,
            description: `Claiming your KODO Rebase`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT CLAIM TRANSACTION
      const veDistContract = new web3.eth.Contract(CONTRACTS.VE_DIST_ABI, CONTRACTS.VE_DIST_ADDRESS)

      this._callContractWait(
        web3,
        veDistContract,
        'claim',
        [tokenID],
        account,
        gasPrice,
        null,
        null,
        claimTXID,
        async (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this.getRewardBalancesALL()
          this.emitter.emit(ACTIONS.CLAIM_VE_DIST_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  claimPairFees = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { pair, tokenID } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let claimTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `Claim LP fees for ${pair.token0.symbol}/${pair.token1.symbol}`,
        verb: 'LP Fees Claimed',
        transactions: [
          {
            uuid: claimTXID,
            description: `Claiming your LP fees`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT CLAIM TRANSACTION
      const pairContract = new web3.eth.Contract(CONTRACTS.PAIR_ABI, pair.address)

      this._callContractWait(
        web3,
        pairContract,
        'claimFees',
        [],
        account,
        gasPrice,
        null,
        null,
        claimTXID,
        async (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          this.getRewardBalancesALL()
          this.emitter.emit(ACTIONS.CLAIM_REWARD_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  searchWhitelist = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }
      const veToken = this.getStore('veToken')

      const { search } = payload.content

      const voterContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)

      const [isWhitelisted, listingFee] = await Promise.all([
        voterContract.methods.isWhitelisted(search).call(),
        voterContract.methods.listing_fee().call(),
      ])

      const token = await this.getBaseAsset(search)
      token.isWhitelisted = isWhitelisted
      token.listingFee = BigNumber(listingFee)
        .div(10 ** veToken.decimals)
        .toFixed(veToken.decimals)

      this.emitter.emit(ACTIONS.SEARCH_WHITELIST_RETURNED, token)
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  whitelistToken = async (payload) => {
    try {
      const account = stores.accountStore.getStore('account')
      if (!account) {
        console.warn('account not found')
        return null
      }

      const web3 = await stores.accountStore.getWeb3Provider()
      if (!web3) {
        console.warn('web3 not found')
        return null
      }

      const { token, nft } = payload.content

      // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
      let whitelistTXID = this.getTXUUID()

      this.emitter.emit(ACTIONS.TX_ADDED, {
        title: `WHITELIST ${token.symbol}`,
        verb: 'Token Whitelisted',
        transactions: [
          {
            uuid: whitelistTXID,
            description: `Whitelisting ${token.symbol}`,
            status: 'WAITING',
          },
        ],
      })

      const gasPrice = await stores.accountStore.getGasPrice()

      // SUBMIT WHITELIST TRANSACTION
      const voterContract = new web3.eth.Contract(CONTRACTS.VOTER_ABI, CONTRACTS.VOTER_ADDRESS)

      this._callContractWait(
        web3,
        voterContract,
        'whitelist',
        [token.address, nft.id],
        account,
        gasPrice,
        null,
        null,
        whitelistTXID,
        async (err) => {
          if (err) {
            return this.emitter.emit(ACTIONS.ERROR, err)
          }

          if (typeof window !== 'undefined') {
            window.setTimeout(() => {
              this.dispatcher.dispatch({
                type: ACTIONS.SEARCH_WHITELIST,
                content: { search: token.address },
              })
            }, 2)
          }

          this.emitter.emit(ACTIONS.WHITELIST_TOKEN_RETURNED)
        }
      )
    } catch (ex) {
      console.error(ex)
      this.emitter.emit(ACTIONS.ERROR, ex)
    }
  }

  // // airdrop
  // getAirdropInfo = async () => {
  //   try {
  //     const web3 = await stores.accountStore.getWeb3Provider()
  //     if (!web3) {
  //       console.warn('web3 not found')
  //       return null
  //     }

  //     let airdropInfo = this.getStore('airdropInfo')

  //     if (!airdropInfo) {
  //       const airdropContract = new web3.eth.Contract(CONTRACTS.MERKLE_CLAIM_ABI, CONTRACTS.MERKLE_CLAIM_ADDRESS)

  //       const [startTime, duration] = await Promise.all([
  //         airdropContract.methods.startTime().call(),
  //         airdropContract.methods.duration().call(),
  //       ])

  //       airdropInfo = { startTime, duration }

  //       this.setStore({ airdropInfo })
  //     }

  //     return airdropInfo
  //   } catch (ex) {
  //     console.error(ex)
  //     return null
  //   }
  // }

  // // airdrop
  // getHasClaimed = async (address) => {
  //   try {
  //     const web3 = await stores.accountStore.getWeb3Provider()
  //     if (!web3) {
  //       console.warn('web3 not found')
  //       return null
  //     }

  //     const airdropContract = new web3.eth.Contract(CONTRACTS.MERKLE_CLAIM_ABI, CONTRACTS.MERKLE_CLAIM_ADDRESS)

  //     const claimed = await airdropContract.methods.hasClaimed(address).call()

  //     return claimed
  //   } catch (ex) {
  //     console.error(ex)
  //     return null
  //   }
  // }

  // getClaimedAmount = async (address) => {
  //   try {
  //     const web3 = await stores.accountStore.getWeb3Provider()
  //     if (!web3) {
  //       console.warn('web3 not found')
  //       return null
  //     }

  //     const airdropContract = new web3.eth.Contract(CONTRACTS.MERKLE_CLAIM_ABI, CONTRACTS.MERKLE_CLAIM_ADDRESS)

  //     const claimedAmount = await airdropContract.methods.claimedAmounts(address).call()

  //     // console.log('====claimedAmount', claimedAmount)

  //     return BigNumber(claimedAmount)
  //       .div(10 ** 18)
  //       .toNumber()
  //   } catch (ex) {
  //     console.error(ex)
  //     return null
  //   }
  // }

  // claimAirdrop = async (payload) => {
  //   try {
  //     const account = stores.accountStore.getStore('account')
  //     if (!account) {
  //       console.warn('account not found')
  //       return null
  //     }

  //     const web3 = await stores.accountStore.getWeb3Provider()
  //     if (!web3) {
  //       console.warn('web3 not found')
  //       return null
  //     }

  //     const { formattedAddress, numTokens, proof } = payload.content

  //     // ADD TRNASCTIONS TO TRANSACTION QUEUE DISPLAY
  //     let claimTXID = this.getTXUUID()

  //     this.emitter.emit(ACTIONS.TX_ADDED, {
  //       title: `Claim Your Airdrop`,
  //       verb: 'Airdrop Claimed',
  //       transactions: [
  //         {
  //           uuid: claimTXID,
  //           description: `Claiming veKODO`,
  //           status: 'WAITING',
  //         },
  //       ],
  //     })

  //     const gasPrice = await stores.accountStore.getGasPrice()
  //     const airdropContract = new web3.eth.Contract(CONTRACTS.MERKLE_CLAIM_ABI, CONTRACTS.MERKLE_CLAIM_ADDRESS)

  //     this._callContractWait(
  //       web3,
  //       airdropContract,
  //       'claim',
  //       [formattedAddress, numTokens, proof],
  //       account,
  //       gasPrice,
  //       null,
  //       null,
  //       claimTXID,
  //       (err) => {
  //         if (err) {
  //           return this.emitter.emit(ACTIONS.ERROR, err)
  //         }

  //         this.emitter.emit(ACTIONS.CLAIM_AIRDROP_RETURNED)
  //       }
  //     )
  //   } catch (ex) {
  //     console.error(ex)
  //     this.emitter.emit(ACTIONS.ERROR, ex)
  //   }
  // }

  _callContractWait = (
    web3,
    contract,
    method,
    params,
    account,
    gasPrice,
    dispatchEvent,
    dispatchContent,
    uuid,
    callback,
    paddGasCost,
    sendValue = null
  ) => {
    console.log('method', method)
    console.log('params', params)
    // if(sendValue) {
    //   console.log(sendValue)
    // }
    // console.log(uuid)
    //estimate gas
    this.emitter.emit(ACTIONS.TX_PENDING, { uuid })

    const gasCost = contract.methods[method](...params)
      .estimateGas({ from: account.address, value: sendValue })
      .then((gasAmount) => {
        const context = this

        // let sendGasAmount = BigNumber(gasAmount).times(1.5).toFixed(0)
        let sendGasAmount = BigNumber(gasAmount).times(1.5).toFixed(0)
        let sendGasPrice = BigNumber(gasPrice).times(1.5).toFixed(9)
        if (paddGasCost) {
          sendGasAmount = BigNumber(sendGasAmount).times(1.15).toFixed(0)
        }
        //
        // const sendGasAmount = '3000000'
        // const context = this
        //
        contract.methods[method](...params)
          .send({
            from: account.address,
            gas: sendGasAmount,
            value: sendValue,
            maxFeePerGas: web3.utils.toWei('0.050000001', 'gwei'),
            maxPriorityFeePerGas: web3.utils.toWei('0.05', 'gwei'),
            // maxFeePerGas: null,
            // maxPriorityFeePerGas: null,
            // gasPrice: web3.utils.toWei(sendGasPrice, 'gwei'),
            // maxFeePerGas: web3.utils.toWei(gasPrice, 'gwei'),
            // maxPriorityFeePerGas: web3.utils.toWei('2', 'gwei'),
          })
          .on('transactionHash', function (txHash) {
            context.emitter.emit(ACTIONS.TX_SUBMITTED, { uuid, txHash })
          })
          .on('receipt', function (receipt) {
            context.emitter.emit(ACTIONS.TX_CONFIRMED, {
              uuid,
              txHash: receipt.transactionHash,
            })
            callback(null, receipt.transactionHash)
            if (dispatchEvent) {
              context.dispatcher.dispatch({
                type: dispatchEvent,
                content: dispatchContent,
              })
            }
          })
          .on('error', function (error) {
            if (!error.toString().includes('-32601')) {
              if (error.message) {
                context.emitter.emit(ACTIONS.TX_REJECTED, {
                  uuid,
                  error: error.message,
                })
                return callback(error.message)
              }
              context.emitter.emit(ACTIONS.TX_REJECTED, { uuid, error })
              callback(error)
            }
          })
          .catch((error) => {
            if (!error.toString().includes('-32601')) {
              if (error.message) {
                context.emitter.emit(ACTIONS.TX_REJECTED, {
                  uuid,
                  error: error.message,
                })
                return callback(error.message)
              }
              context.emitter.emit(ACTIONS.TX_REJECTED, { uuid, error })
              callback(error)
            }
          })
      })
      .catch((ex) => {
        console.log(ex)
        if (ex.message) {
          this.emitter.emit(ACTIONS.TX_REJECTED, { uuid, error: ex.message })
          return callback(ex.message)
        }
        this.emitter.emit(ACTIONS.TX_REJECTED, {
          uuid,
          error: 'Error estimating gas',
        })
        callback(ex)
      })
  }

  _makeBatchRequest = (web3, callFrom, calls) => {
    let batch = new web3.BatchRequest()

    let promises = calls.map((call) => {
      return new Promise((res, rej) => {
        let req = call.request({ from: callFrom }, (err, data) => {
          if (err) rej(err)
          else res(data)
        })
        batch.add(req)
      })
    })
    batch.execute()

    return Promise.all(promises)
  }
  //
  // _getMulticallWatcher = (web3, calls) => {
  //
  // }
}

export default Store
