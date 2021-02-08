pragma solidity >0.5.0 <0.8.0;

contract Mock_ExecutionManager {
    function getMaxTransactionGasLimit()
        public
        view
        returns (
            uint256
        )
    {
        return 8000000;
    }
}
