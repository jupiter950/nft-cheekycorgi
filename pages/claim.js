import React, {useState, useEffect} from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Head from 'next/head'
import Image from 'next/image'
import {NotificationManager} from 'react-notifications'

import SubmitButton from '../components/SubmitButton'

import useContract from '../hooks/useContract'
import useRefresh from '../hooks/useRefresh'

import erc20ABI from "../data/erc20.json"
import erc721EnumerableABI from "../data/erc721Enumerable.json"
import { toReduced } from '../utils/address'
import { getGasPrice } from '../utils/gasprice'

export default function Claim() {
  const wallet = useSelector(state => state.wallet)
  const [web3, nftContract, yieldContract] = useContract()

  const { fastRefresh } = useRefresh()

  const [publicSaleStart, setPublicSaleStart] = useState(Date.now() / 1000)

  const [totalClaimed, setTotalClaimed] = useState(0)
  const [maxClaimable, setMaxClaimable] = useState(300)
  const [claimed, setClaimed] = useState(false)
  const [pendingClaim, setPendingClaim] = useState(false)

  const [claimableNftContracts, setClaimableNftContracts] = useState([])
  const [totalClaimableNftCounts, setTotalClaimableNftCounts] = useState(0)
  const [claimableNftBalances, setClaimableNftBalances] = useState([])

  const [claimableUcdAddress, setClaimableUcdAddress] = useState()
  const [claimableByUcd, setClaimableByUcd] = useState()

  const [ethBalance, setEthBalance] = useState(0)

  const onClickClaim = async () => {
    console.log('total claimed: ', totalClaimed)
    console.log('max claimed: ', maxClaimable)

    if ((!totalClaimableNftCounts && !claimableByUcd) || totalClaimed >= maxClaimable) {
      return NotificationManager.error('All claimed already!')
    }
    console.log('Claiming cheekycorgi ...')

    setPendingClaim(true)
    try {
      // claim by UCD holdings
      if (claimableByUcd) {
        console.log('>>>> Claiming CheekyCorgi by UCD: ', claimableUcdAddress)
        await nftContract.methods.claim(claimableUcdAddress, 0).send({from: wallet.address})
        setClaimed(true)
        setPendingClaim(false)
        return NotificationManager.success('Successfully claimed!')
      }

      // claim by Friendship NFT, ApprovingCorgis, JunkYard
      for(let _collectionId = 0; _collectionId < claimableNftContracts.length; _collectionId ++) {
        let _collection = claimableNftContracts[_collectionId]

        if (claimableNftBalances[_collectionId] > 0) {
          for (let _index = 0; _index < claimableNftBalances[_collectionId]; _index ++) {
            let _tokenId = await _collection.contract.methods.tokenOfOwnerByIndex(wallet.address, _index).call()
            console.log('>>>> Claiming CheekyCorgi by ', _collectionId, _tokenId)

            let _isClaimedAlready = await nftContract.methods.isClaimedAlready(_collectionId, _tokenId).call()
            console.log('>>>> Claiming CheekyCorgi by ', _collection.address, _tokenId, _isClaimedAlready)

            let _gasPrice = web3.utils.toWei(await getGasPrice(), "gwei")
            console.log('gas price: ', _gasPrice)

            if (!_isClaimedAlready) {
              let _gas = await nftContract.methods
                .claim(_collection.address, _tokenId)
                .estimateGas({from: wallet.address})
              
              if (_gas * Number(_gasPrice) * 1.2 > ethBalance) {
                return NotificationManager.info('Insufficient Balance!')
              }

              await nftContract.methods
                .claim(_collection.address, _tokenId)
                .send({
                  from: wallet.address,
                  gasPrice: _gasPrice
                })
              setClaimed(true)
              setPendingClaim(false)
              return NotificationManager.success('Successfully claimed!')
            }
          }
        }
      }
    } catch(e) {
      setPendingClaim(false)
      console.log('error: ', e)
      return NotificationManager.error('Claiming failed unexpectedly!')
    }
    setPendingClaim(false)
    return NotificationManager.success('Sorry, but you can not claim CheekyCorgi!')
  }

  useEffect(() => {
    const fetchClaimedStatus = async () => {
      // console.log('fetch claimed status ...')
      let _publicSaleOpen = await nftContract.methods.PUBLIC_SALE_OPEN().call()
      // console.log('public sale open: ', _publicSaleOpen, '/', Date.now() / 1000)
      setPublicSaleStart(_publicSaleOpen)

      let _totalClaimed = await nftContract.methods.totalClaimed().call()
      let _maxClaimable = await nftContract.methods.maxClaimable().call()
      // console.log('total claimed: ', _totalClaimed)
      // console.log('max claimable: ', _maxClaimable)
      setTotalClaimed(Number(_totalClaimed))
      setMaxClaimable(Number(_maxClaimable))

      let _claimed = await nftContract.methods.claimedAddresses(wallet.address).call()
      setClaimed(_claimed)
      // console.log('claimed: ', claimed)
      
      let _claimables = await nftContract.methods.getClaimables().call()
      // console.log('claimables: ', _claimables)

      let _claimableNftContracts = [], _totalBalance = 0, _balances = []
      for (let _contractAddress of _claimables.slice(0, 2)) {
        let _contract = new web3.eth.Contract(erc721EnumerableABI, _contractAddress)
        let _balanceOf = await _contract.methods.balanceOf(wallet.address).call()
        _totalBalance += Number(_balanceOf)

        _claimableNftContracts.push({
          address: _contractAddress,
          contract: _contract,
        })
        _balances.push(Number(_balanceOf))
      }
      setClaimableNftContracts(_claimableNftContracts)
      setTotalClaimableNftCounts(_totalBalance)
      setClaimableNftBalances(_balances)

      // console.log('ucd address: ', _claimables[_claimables.length - 1])
      setClaimableUcdAddress(_claimables[_claimables.length - 1])

      let _claimableByUcd = await nftContract.methods.claimableUcdHolders(wallet.address).call()
      setClaimableByUcd(_claimableByUcd)

      let _ethBalance = await web3.eth.getBalance(wallet.address)
      setEthBalance(Number(_ethBalance))
      // console.log('created claimable contracts: ', _claimableNftContracts.length)
      // console.log('claimable nft balance: ', _totalBalance)
      // console.log('claimable by ucd: ', _claimableByUcd)
    }

    if (nftContract) {
      fetchClaimedStatus()
    }
  }, [nftContract])

  useEffect(() => {
    const fetchStatus = async () => {
      // [UPDATEME] Remove commenct below
      let _claimed = await nftContract.methods.claimedAddresses(wallet.address).call()
      setClaimed(_claimed)
      // console.log('claimed: ', claimed)

      let _totalClaimed = await nftContract.methods.totalClaimed().call()
      setTotalClaimed(Number(_totalClaimed))
      // console.log('total claimed: ', _totalClaimed)
  
      let _totalBalance = 0, _balances = []
      for (let _collection of claimableNftContracts) {
        let _balanceOf = await _collection.contract.methods.balanceOf(wallet.address).call()
        // console.log('fetching balanceOf: ', _collection.address, _balanceOf)
        _totalBalance += Number(_balanceOf)
        _balances.push(Number(_balanceOf))
      }
      // console.log('claimable nft balance: ', _totalBalance)
      setTotalClaimableNftCounts(_totalBalance)
      setClaimableNftBalances(_balances)

      let _claimableByUcd = await nftContract.methods.claimableUcdHolders(wallet.address).call()
      console.log('claimableByUcd: ', _claimableByUcd)
      setClaimableByUcd(_claimableByUcd)

      let _ethBalance = await web3.eth.getBalance(wallet.address)
      setEthBalance(Number(_ethBalance))
    }

    if (nftContract && claimableNftContracts.length > 0) {
      fetchStatus()
    }
  }, [fastRefresh])

  return (
    <div className="claim">
      <Head>
        <title>Claim | CheekyCorgi.com</title>
      </Head>
      <div className="public-mint-wrapper">
        <h1>Exclusive Partnership</h1>
        <p className="comment">
          Friend, here&apos;s your free CheekyCorgi<br/>
          buddy for claiming. Cheers to friendship!
        </p>
        <p className="account-info">
          Connected Account: {toReduced(wallet.address, 4)}
        </p>
        <p className="account-info">
          Friendship NFT Found: {totalClaimableNftCounts}
        </p>

        <div className="mint-button-holder">
          <SubmitButton 
            onClick={onClickClaim}
            disabled={
              (publicSaleStart > Date.now() / 1000) ||
              claimed || 
              (!totalClaimableNftCounts && !claimableByUcd) || 
              pendingClaim
            }
          >
            {
              claimed ? 
              'Claimed Already' : 
              (
                pendingClaim ? 'Claiming' : 'CLAIM FOR FREE (EXCLUDE GAS)'
              )
            }
          </SubmitButton>
        </div>
        
        <p className="total-minted">
          Total supply: {maxClaimable - totalClaimed}
        </p>

        <p className="claimable-nfts">
          Reserved for ApprovingCorgis, JunkyardDogs
        </p>
      </div>
    </div>
  )
}
