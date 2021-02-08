pragma solidity >0.5.0 <0.8.0;
pragma experimental ABIEncoderV2;

contract Mock_CanonicalTransactionChain {
    struct TransactionEnqueuedData {
        address l1TxOrigin;
        address target;
        uint256 gasLimit;
        bytes data;
        uint256 queueIndex;
        uint256 timestamp;
    }

    event TransactionEnqueued(
        address _l1TxOrigin,
        address _target,
        uint256 _gasLimit,
        bytes _data,
        uint256 _queueIndex,
        uint256 _timestamp
    );

    function emitTransactionEnqueued(
        TransactionEnqueuedData memory _event
    )
        public
    {
        emit TransactionEnqueued(
            _event.l1TxOrigin,
            _event.target,
            _event.gasLimit,
            _event.data,
            _event.queueIndex,
            _event.timestamp
        );
    }

    function emitMultipleTransactionEnqueued(
        TransactionEnqueuedData[] memory _events
    )
        public
    {
        for (uint256 i = 0; i < _events.length; i++) {
            emitTransactionEnqueued(_events[i]);
        }
    }
}
