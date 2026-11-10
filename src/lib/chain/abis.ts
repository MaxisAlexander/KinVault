// Minimal, hand-curated ABIs for the Mezo Testnet contracts KinVault uses.
// Keeping these small makes the browser bundle predictable and the server
// verifier auditable. Every signature here is exercised by blockchain.test.ts.
import { parseAbi } from "viem";

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

export const priceFeedAbi = parseAbi([
  "function TARGET_DIGITS() view returns (uint8)",
  "function fetchPrice() view returns (uint256)",
  "function oracle() view returns (address)",
]);

export const borrowerOperationsAbi = parseAbi([
  "function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) payable",
  "function adjustTrove(uint256 _collWithdrawal, uint256 _debtChange, bool _isDebtIncrease, address _upperHint, address _lowerHint) payable",
  "function withdrawColl(uint256 _amount, address _upperHint, address _lowerHint)",
  "function repayMUSD(uint256 _amount, address _upperHint, address _lowerHint)",
  "function closeTrove()",
  "function MUSD_GAS_COMPENSATION() view returns (uint256)",
  "function MIN_NET_DEBT_MIN() view returns (uint256)",
  "function minNetDebt() view returns (uint256)",
  "function borrowingRate() view returns (uint256)",
  "function troveManager() view returns (address)",
  // The verifier decodes these events instead of trusting current trove state.
  "event TroveCreated(address indexed _borrower, uint256 arrayIndex)",
  "event TroveUpdated(address indexed _borrower, uint256 _principal, uint256 _interest, uint256 _coll, uint256 _stake, uint16 _interestRate, uint256 _lastInterestUpdateTime, uint8 _operation)",
  "event BorrowingFeePaid(address indexed _borrower, uint256 _fee)",
]);

export const troveManagerAbi = parseAbi([
  "function MCR() view returns (uint256)",
  "function CCR() view returns (uint256)",
  "function getTroveStatus(address _borrower) view returns (uint8)",
  "function getTroveColl(address _borrower) view returns (uint256)",
  "function getTroveDebt(address _borrower) view returns (uint256)",
  "function getTroveInterestOwed(address _borrower) view returns (uint256)",
  "function getTroveMaxBorrowingCapacity(address _borrower) view returns (uint256)",
  "function getCurrentICR(address _borrower, uint256 _price) view returns (uint256)",
  "function getTroveOwnersCount() view returns (uint256)",
]);

export const hintHelpersAbi = parseAbi([
  "function getApproxHint(uint256 _CR, uint256 _numTrials, uint256 _inputRandomSeed) view returns (address hint, uint256 diff, uint256 seed)",
  "function computeNominalCR(uint256 _coll, uint256 _debt) pure returns (uint256)",
]);

export const sortedTrovesAbi = parseAbi([
  "function findInsertPosition(uint256 _NICR, address _prevId, address _nextId) view returns (address, address)",
  "function getSize() view returns (uint256)",
]);

export const mezoAbi = {
  erc20: erc20Abi,
  priceFeed: priceFeedAbi,
  borrowerOperations: borrowerOperationsAbi,
  troveManager: troveManagerAbi,
  hintHelpers: hintHelpersAbi,
  sortedTroves: sortedTrovesAbi,
} as const;
