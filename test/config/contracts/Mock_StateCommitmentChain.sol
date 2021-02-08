pragma solidity >0.5.0 <0.8.0;

contract Mock_StateCommitmentChain {
    event StateBatchAppended(
        uint256 indexed _batchIndex,
        bytes32 _batchRoot,
        uint256 _batchSize,
        uint256 _prevTotalElements,
        bytes _extraData
    );

    function emitStateBatchAppended(
        uint256 _batchIndex,
        bytes32 _batchRoot,
        uint256 _batchSize,
        uint256 _prevTotalElements,
        bytes memory _extraData
    )
        public
    {
        emit StateBatchAppended(
            _batchIndex,
            _batchRoot,
            _batchSize,
            _prevTotalElements,
            _extraData
        );
    }
}
