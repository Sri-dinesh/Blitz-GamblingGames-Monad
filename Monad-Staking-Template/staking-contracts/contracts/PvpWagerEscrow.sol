// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PvpWagerEscrow is ReentrancyGuard {
    struct Match {
        address creator;
        address opponent;
        uint256 stake;
        bool joined;
        bool finished;
        bool claimed;
        address winner;
        uint256 createdAt;
        uint256 joinedAt;
    }

    mapping(bytes32 => Match) public matches;
    mapping(bytes32 => mapping(address => address)) public winnerVotes;

    event MatchCreated(bytes32 indexed matchId, address indexed creator, address indexed opponent, uint256 stake);
    event MatchJoined(bytes32 indexed matchId, address indexed opponent, uint256 stake);
    event WinnerVoted(bytes32 indexed matchId, address indexed voter, address indexed winner);
    event MatchFinalized(bytes32 indexed matchId, address indexed winner);
    event PotClaimed(bytes32 indexed matchId, address indexed winner, uint256 amount);

    error InvalidAddress();
    error InvalidStake();
    error MatchAlreadyExists();
    error MatchNotFound();
    error NotMatchPlayer();
    error OpponentMismatch();
    error MatchAlreadyJoined();
    error MatchNotJoined();
    error MatchAlreadyFinished();
    error MatchNotFinished();
    error WinnerNotDecided();
    error NotWinner();
    error AlreadyClaimed();

    function createMatch(bytes32 matchId, address opponent) external payable {
        if (opponent == address(0) || opponent == msg.sender) revert InvalidAddress();
        if (msg.value == 0) revert InvalidStake();

        Match storage m = matches[matchId];
        if (m.creator != address(0)) revert MatchAlreadyExists();

        matches[matchId] = Match({
            creator: msg.sender,
            opponent: opponent,
            stake: msg.value,
            joined: false,
            finished: false,
            claimed: false,
            winner: address(0),
            createdAt: block.timestamp,
            joinedAt: 0
        });

        emit MatchCreated(matchId, msg.sender, opponent, msg.value);
    }

    function joinMatch(bytes32 matchId) external payable {
        Match storage m = matches[matchId];
        if (m.creator == address(0)) revert MatchNotFound();
        if (m.joined) revert MatchAlreadyJoined();
        if (msg.sender != m.opponent) revert OpponentMismatch();
        if (msg.value != m.stake) revert InvalidStake();

        m.joined = true;
        m.joinedAt = block.timestamp;

        emit MatchJoined(matchId, msg.sender, msg.value);
    }

    function voteWinner(bytes32 matchId, address winner) external {
        Match storage m = matches[matchId];
        if (m.creator == address(0)) revert MatchNotFound();
        if (!m.joined) revert MatchNotJoined();
        if (m.finished) revert MatchAlreadyFinished();
        if (msg.sender != m.creator && msg.sender != m.opponent) revert NotMatchPlayer();
        if (winner != m.creator && winner != m.opponent) revert InvalidAddress();

        winnerVotes[matchId][msg.sender] = winner;

        emit WinnerVoted(matchId, msg.sender, winner);

        address creatorVote = winnerVotes[matchId][m.creator];
        address opponentVote = winnerVotes[matchId][m.opponent];

        if (creatorVote != address(0) && creatorVote == opponentVote) {
            m.finished = true;
            m.winner = creatorVote;
            emit MatchFinalized(matchId, creatorVote);
        }
    }

    function claimPot(bytes32 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.creator == address(0)) revert MatchNotFound();
        if (!m.finished) revert MatchNotFinished();
        if (m.winner == address(0)) revert WinnerNotDecided();
        if (m.claimed) revert AlreadyClaimed();
        if (msg.sender != m.winner) revert NotWinner();

        m.claimed = true;
        uint256 pot = m.stake * 2;

        (bool success, ) = msg.sender.call{value: pot}("");
        require(success, "pot transfer failed");

        emit PotClaimed(matchId, msg.sender, pot);
    }

    function getMatch(bytes32 matchId)
        external
        view
        returns (
            address creator,
            address opponent,
            uint256 stake,
            bool joined,
            bool finished,
            bool claimed,
            address winner,
            uint256 createdAt,
            uint256 joinedAt
        )
    {
        Match memory m = matches[matchId];
        if (m.creator == address(0)) revert MatchNotFound();

        return (
            m.creator,
            m.opponent,
            m.stake,
            m.joined,
            m.finished,
            m.claimed,
            m.winner,
            m.createdAt,
            m.joinedAt
        );
    }
}
