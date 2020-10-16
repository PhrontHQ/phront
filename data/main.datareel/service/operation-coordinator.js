// if(global && typeof global.XMLHttpRequest === undefined) {
//     global.XMLHttpRequest = require('xhr2');
// }
var Montage = require("montage/core/core").Montage,
MontageSerializer = require("montage/core/serialization/serializer/montage-serializer").MontageSerializer,
Deserializer = require("montage/core/serialization/deserializer/montage-deserializer").MontageDeserializer,
// mainService = require("data/main.datareel/main.mjson").montageObject,
//phrontService = mainService.childServices[0],
DataOperation = require("montage/data/service/data-operation").DataOperation,
defaultEventManager = require("montage/core/event/event-manager").defaultEventManager,
sizeof = require('object-sizeof');

exports.OperationCoordinator = Montage.specialize(/** @lends OperationCoordinator.prototype */ {

    /***************************************************************************
     * Constructor
     */

    constructor: {
        value: function OperationCoordinator(worker) {
            this._serializer = new MontageSerializer().initWithRequire(require);
            this._deserializer = new Deserializer();

            this._gatewayClientByClientId = new Map();

            var mainService = worker.mainService;
            //Do we need to keep a handle on it?
            this.worker = worker;
            this.mainService = mainService;
            this.application = defaultEventManager.application;

            var phrontService = this.mainService.childServices[0];


            phrontService.operationCoordinator = this;
            worker.addEventListener(DataOperation.Type.Connect,phrontService,false);

            mainService.addEventListener(DataOperation.Type.Read,phrontService,false);
            mainService.addEventListener(DataOperation.Type.Update,phrontService,false);
            mainService.addEventListener(DataOperation.Type.Create,phrontService,false);
            mainService.addEventListener(DataOperation.Type.Delete,phrontService,false);
            mainService.addEventListener(DataOperation.Type.CreateTransaction,phrontService,false);
            mainService.addEventListener(DataOperation.Type.PerformTransaction,phrontService,false);
            mainService.addEventListener(DataOperation.Type.RollbackTransaction,phrontService,false);

            mainService.addEventListener(DataOperation.Type.ReadFailed,this,false);
            mainService.addEventListener(DataOperation.Type.ReadCompleted,this,false);
            mainService.addEventListener(DataOperation.Type.UpdateFailed,this,false);
            mainService.addEventListener(DataOperation.Type.UpdateCompleted,this,false);
            mainService.addEventListener(DataOperation.Type.CreateFailed,this,false);
            mainService.addEventListener(DataOperation.Type.CreateCompleted,this,false);
            mainService.addEventListener(DataOperation.Type.DeleteFailed,this,false);
            mainService.addEventListener(DataOperation.Type.DeleteCompleted,this,false);
            mainService.addEventListener(DataOperation.Type.CreateTransactionFailed,this,false);
            mainService.addEventListener(DataOperation.Type.CreateTransactionCompleted,this,false);
            mainService.addEventListener(DataOperation.Type.PerformTransactionFailed,this,false);
            mainService.addEventListener(DataOperation.Type.PerformTransactionCompleted,this,false);
            mainService.addEventListener(DataOperation.Type.RollbackTransactionFailed,this,false);
            mainService.addEventListener(DataOperation.Type.RollbackTransactionCompleted,this,false);

            return this;
        }
    },

    MAX_PAYLOAD_SIZE: {
        value: 63
    },

    registerGatewayClientForClientId: {
        value: function(gatewayClient, clientId) {
            this._gatewayClientByClientId.set(clientId,gatewayClient);
        }
    },
    gatewayClientForClientId: {
        value: function(clientId) {
            return this._gatewayClientByClientId.get(clientId);
        }
    },
    unregisterGatewayClientForClientId: {
        value: function(gatewayClient, clientId) {
            this._gatewayClientByClientId.set(clientId,gatewayClient);
        }
    },

    _sendData: {
        value: function (previousPromise, connection, clientId, data) {
            // console.log("OperationCoordinator: _sendData to connection:", connection, clientId, data);

            return (previousPromise || Promise.resolve(true))
                    .then(function() {
                        try {

                            return postToConnectionPromise = connection.postToConnection({
                                ConnectionId: clientId,
                                Data: data
                            }).promise();
                        } catch (e) {
                            console.log("OperationCoordinator: _sendData postToConnection error:", e, connection, clientId, data);

                            if (e.statusCode === 410) {
                                console.log(`Found stale connection, should delete connectionId ${clientId}`);
                                // await ddb.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
                            } else {
                                console.error(e);
                                throw e;
                            }
                        }

                    });
        }
    },

    dispatchOperationToConnectionClientId: {
        value: function(operation, connection, clientId) {

            //console.log("OperationCoordinator: dispatchOperationToConnectionClientId()",operation, connection, clientId)

            //remove _target & _currentTarget as it creates a pbm? and we don't need to send it
            delete operation._currentTarget;

            //We need to assess the size of the data returned.
            //serialize
            var operationSerialization = this._serializer.serializeObject(operation);
            var operationDataKBSize = sizeof(operationSerialization) / 1024;
            if(operationDataKBSize < this.MAX_PAYLOAD_SIZE) {
                //console.log("operation size is "+operationDataKBSize);
                //console.log("OperationCoordinator: dispatchOperationToConnectionClientId() connection.postToConnection #1 operation.referrerId "+operation.referrerId);

                return this._sendData(undefined, connection, clientId, operationSerialization);

                // return connection
                // .postToConnection({
                //     ConnectionId: clientId,
                //     Data: this._serializer.serializeObject(operation)
                // })
                // .promise();
            }
            else {
                /*
                    Failing:
                    Large ReadOperation split in 1 sub operations: operationDataKBSize:230.927734375, integerSizeQuotient:1, sizeRemainder:102.927734375, operationData.length:0, integerLengthQuotient:170, lengthRemainder: 0


                */

               //console.log("dispatchOperationToConnectionClientId: referrerId "+operation.referrerId);

                var integerSizeQuotient = Math.floor(operationDataKBSize / this.MAX_PAYLOAD_SIZE),
                    sizeRemainder = operationDataKBSize % this.MAX_PAYLOAD_SIZE,
                    sizeRemainderRatio = sizeRemainder/operationDataKBSize,
                    operationData = operation.data,
                    integerLengthQuotient = Math.floor(operationData.length / integerSizeQuotient),
                    lengthRemainder = operationData.length % integerSizeQuotient,
                    i=0, countI = integerSizeQuotient, iData, iReadUpdateOperation,
                    iPromise = Promise.resolve(true);
                    promises = [],
                    self = this;

                    if(lengthRemainder === 0 && sizeRemainder > 0) {
                        lengthRemainder = Math.floor(operationData.length*sizeRemainderRatio);
                        integerLengthQuotient = integerLengthQuotient-Math.floor(lengthRemainder/integerSizeQuotient);
                        //integerLengthQuotient = operationData.length-lengthRemainder;
                    }

                    iReadUpdateOperation = new DataOperation();
                    iReadUpdateOperation.type = DataOperation.Type.ReadUpdate;
                    iReadUpdateOperation.target = operation.target;
                    iReadUpdateOperation.criteria = operation.criteria;
                    iReadUpdateOperation.referrerId = operation.referrerId;

                    for(;(i<countI);i++) {
                        iReadUpdateOperation.data = operationData.splice(0,integerLengthQuotient);
                        if((operation.type === DataOperation.Type.ReadCompleted) && i === (countI-1) && (operationData.length === 0)) {
                            iReadUpdateOperation.type = DataOperation.Type.ReadCompleted;
                        }

                        //console.log("OperationCoordinator: dispatchOperationToConnectionClientId() connection.postToConnection #2 operation.referrerId "+operation.referrerId);
                        iPromise = this._sendData(iPromise, connection, clientId, self._serializer.serializeObject(iReadUpdateOperation));

                        // iPromise = iPromise.then(function() {
                        //     console.log("OperationCoordinator: dispatchOperationToConnectionClientId() connection.postToConnection #2",operation, connection, clientId);
                        //     return connection.postToConnection({
                        //         ConnectionId: clientId,
                        //         Data: self._serializer.serializeObject(iReadUpdateOperation)
                        //     }).promise();
                        //})
                    }

                    //Sends the last if some left:
                    if(lengthRemainder || operationData.length) {
                        //console.log("OperationCoordinator: dispatchOperationToConnectionClientId() connection.postToConnection #3 operation.referrerId "+operation.referrerId);
                        iPromise = this._sendData(iPromise, connection, clientId, self._serializer.serializeObject(operation));

                        // iPromise = iPromise.then(function() {
                        //     console.log("OperationCoordinator: dispatchOperationToConnectionClientId() connection.postToConnection #3",operation, connection, clientId);
                        //     return connection.postToConnection({
                        //         ConnectionId: clientId,
                        //         Data: self._serializer.serializeObject(operation)
                        //     }).promise()
                        // });
                    }
                    //console.log(">>>>Large ReadOperation split in "+(countI+lengthRemainder)+ " sub operations: operationDataKBSize:"+operationDataKBSize+", integerSizeQuotient:"+integerSizeQuotient+", sizeRemainder:"+sizeRemainder+", operationData.length:"+operationData.length+", integerLengthQuotient:"+integerLengthQuotient+", lengthRemainder:",lengthRemainder );
                    return iPromise;
            }
        }
    },

    /*
        Event Handler for DataOperations destined to clients.

        We might want to add a layer of caching where an operation sent by one client, might end up being the same as subsequent ones sent by others, in which case the one in flight could be used to dispatch to the other clients, making sure we'd match their referrerId, etc... before we serialize and send them back.

        Look at https://github.com/puleos/object-hash
        when it comes to pooling operations bound to the database.
    */

    handleEvent: {
        value: function(operation) {
            var self = this;
            //console.log("handleEvent:",operation);
            this.dispatchOperationToConnectionClientId(operation,this.gateway,operation.clientId)
            .then(function(values) {
                //resolve
                self._operationPromisesByReferrerId.get(operation.referrerId)[0]();
            },function(error) {
                //reject
                self._operationPromisesByReferrerId.get(operation.referrerId)[1]();
            });
        }
    },
    /*

        var serializedHandledOperation = await operationCoordinator.handleMessage(event, context, cb, client);

    */
    gateway: {
        value: undefined
    },
    _operationPromisesByReferrerId: {
        value: new Map()
    },

    handleMessage: {
        value: function(event, context, callback, gatewayClient) {

            this.gateway = gatewayClient;

            var serializedOperation = event.body,
                deserializedOperation,
                objectRequires,
                module,
                isSync = true,
                resultOperationPromise,
                self = this,
                phrontService = this.mainService.childServices[0];

            //console.log(serializedOperation);

            this._deserializer.init(serializedOperation, require, objectRequires, module, isSync);
            try {
                deserializedOperation = this._deserializer.deserializeObject();
            } catch (ex) {
                console.error("No deserialization for ",serializedOperation);
            }

            if(deserializedOperation && !deserializedOperation.target && deserializedOperation.dataDescriptor) {
                deserializedOperation.target = this.mainService.objectDescriptorWithModuleId(deserializedOperation.dataDescriptor);
            }

            //Add connection (custom) info the operation:
            // deserializedOperation.connection = gatewayClient;

            /*
                Sets the whole AWS API Gateway event as the dataOperations's context.

                Reading the stage for example -
                aDataOperation.context.requestContext.stage

                Can help a DataService address the right resource/database for that stage
            */
            deserializedOperation.context = event;

            //Set the clientId (in API already)
            deserializedOperation.clientId = event.requestContext.connectionId;

            // console.log("OperationCoordinator handleMessage(...)",deserializedOperation);

            return this.handleOperation(deserializedOperation, event, context, callback, gatewayClient);
        }
    },

    handleOperation: {
        value: function(deserializedOperation, event, context, callback, gatewayClient) {
            var self = this;

            /*
                Workaround until we get the serialization/deserialization to work with an object passed with a label that is pre-existing and passed to both the serialiaer and deserializer on each side.

                So until then, if target is null, it's meant for the coordinaator, needed for transactions that could contain object descriptors that are handled by different data services and the OperationCoordinator will have to handle that himself first to triage, before distributing to the relevant data services by creating nested transactions with the subset of dataoperations/types they deal with.
            */
            if(deserializedOperation.target === null) {
                deserializedOperation.target = this;
            }

            if((deserializedOperation.type ===  DataOperation.Type.Read)
            || (deserializedOperation.type ===  DataOperation.Type.Connect)) {
                resultOperationPromise = new Promise(function(resolve,reject) {
                    self._operationPromisesByReferrerId.set(deserializedOperation.id,[resolve,reject]);
                    defaultEventManager.handleEvent(deserializedOperation);
                });

                return resultOperationPromise;
                //resultOperationPromise = phrontService.handleRead(deserializedOperation);
                //phrontService.handleRead(deserializedOperation);

            } else if(deserializedOperation.type ===  DataOperation.Type.Update) {

                resultOperationPromise = phrontService.handleUpdate(deserializedOperation);

            } else if(deserializedOperation.type ===  DataOperation.Type.Create) {

                resultOperationPromise = phrontService.handleCreate(deserializedOperation);

            } else if(deserializedOperation.type ===  DataOperation.Type.Delete) {

                resultOperationPromise = phrontService.handleDelete(deserializedOperation);

            } else if(deserializedOperation.type ===  DataOperation.Type.CreateTransaction) {

                resultOperationPromise = phrontService.handleCreateTransaction(deserializedOperation);

            } else if(deserializedOperation.type ===  DataOperation.Type.Batch) {

                resultOperationPromise = phrontService.handleBatch(deserializedOperation);

            } else if(deserializedOperation.type ===  DataOperation.Type.PerformTransaction) {

                resultOperationPromise = phrontService.handlePerformTransaction(deserializedOperation);

            } else if(deserializedOperation.type ===  DataOperation.Type.RollbackTransaction) {

                resultOperationPromise = phrontService.handleRollbackTransaction(deserializedOperation);

            } else {
                console.error("OperationCoordinator: not programmed to handle type of operation ",deserializedOperation);
                resultOperationPromise = Promise.reject(null);
            }

            if(!resultOperationPromise) {

                return Promise.resolve(true);

            } else {
                return resultOperationPromise.then(function(operationCompleted) {
                    //serialize
                    // return self._serializer.serializeObject(operationCompleted);
                    return self.dispatchOperationToConnectionClientId(operationCompleted,gatewayClient,event.requestContext.connectionId);

                },function(operationFailed) {
                    console.error("OperationCoordinator: resultOperationPromise failed ",operationFailed);
                    return self.dispatchOperationToConnectionClientId(operationFailed,gatewayClient,event.requestContext.connectionId);
                    // return self._serializer.serializeObject(operationFailed);
                });
            }
        }
    }
});
