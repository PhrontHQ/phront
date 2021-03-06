var PhrontService = require("phront/data/main.datareel/service/phront-service").PhrontService,
    OperationCoordinator = require("phront/data/main.datareel/service/operation-coordinator").OperationCoordinator,

    /*
        !!! There's a pbm because 2 RawDataService, clientMainService(client) and mainService (server) are in the same memory space. The first one takes the tiggers on the prototype, so loading clientMainService first.
    */
    clientMainService = require("../../data/client-main.datareel/main.mjson").montageObject,

    mainService = require("phront/data/main.datareel/main.mjson").montageObject,
    DataOperation = require("montage/data/service/data-operation").DataOperation,
    MontageSerializer = require("montage/core/serialization/serializer/montage-serializer").MontageSerializer,
    Deserializer = require("montage/core/serialization/deserializer/montage-deserializer").MontageDeserializer,
    Criteria = require("montage/core/criteria").Criteria,
    DataStream = require("montage/data/service/data-stream").DataStream,
    DataQuery = require("montage/data/model/data-query").DataQuery,
    Montage = require("montage/core/core").Montage,
    //to test client side
    ClientCollection = require("phront/data/main.datareel/model/collection").Collection,
    ClientImage = require("phront/data/main.datareel/model/image").Image,
    ClientService = require("phront/data/main.datareel/model/service").Service,

    operationCoordinator = new OperationCoordinator,
    phrontService = mainService.childServices[0],
    phrontClientService = clientMainService.childServices[0],
    types = phrontService.types,
    sizeof = require("object-sizeof"),
    uuid = require("montage/core/uuid");


//Hack phrontClientService and Augment operationCoordinator for tests,
//making it assume the role of the WebSocket for phrontClientService

phrontClientService._socketOpenPromise = Promise.resolve(true);
operationCoordinator.send = function(serializedOperation) {
    //return new Promise(function(resolve,reject) {
    var mockContext,
        mockCallback,
        mockGateway =  {
        postToConnection: function(params) {
                this._promise = new Promise(function(resolve,reject) {
                    /* params looks like:
                        {
                            ConnectionId: event.requestContext.connectionId,
                            Data: self._serializer.serializeObject(readOperationCompleted)
                        }
                    */
                var serializedHandledOperation = params.Data;
                phrontClientService.handleMessage({data:serializedHandledOperation});
                resolve(true);

                });
                return this;
            },
            promise: function() {
                return this._promise;
            }
        };

    this.handleEvent({
        requestContext: {
            connectionId: uuid.generate()
        },
        "body":serializedOperation
    },mockContext,mockCallback,mockGateway);

//});

    // .then(function(serializedHandledOperation) {
    //     phrontClientService.handleMessage({data:serializedHandledOperation});
    // },function(error) {
    //     console.error(error);
    // });
}
phrontClientService._socket = operationCoordinator;



exports.promise = new Promise(function(resolve,reject) {

    var serializer = new MontageSerializer().initWithRequire(require),
        deserializer = new Deserializer();


            //"can split a an operation in multiple ones if it's too large for a known payload limit"
            /*
                //Create a ReadOperation
                var serviceDescriptor = phrontService.objectDescriptorWithModuleId("data/main.datareel/model/service"),

                //This ends up calling module-object-descriptor.js:149 - getObjectDescriptorWithModuleId()
                //which causes node to try to phront/node_modules/montage/core/meta/module-object-descriptor.mjson
                //whih is bogus....
                //console.log("Montage.getInfoForObject(objectDescriptor): ", Montage.getInfoForObject(objectDescriptor));

                readOperation = new DataOperation(),
                serviceQuery = DataQuery.withTypeAndCriteria(serviceDescriptor),
                dataStream = new DataStream();

                dataStream.query = serviceQuery;
                readOperation.type = DataOperation.Type.Read;
                readOperation.dataDescriptor = serviceDescriptor.module.id;

                phrontClientService._dispatchOperation(readOperation,dataStream);
            */


        //"can fetch an image from an id without OperationCoordinator"
        /*
            //Create a ReadOperation
            var objectDescriptor = phrontService.objectDescriptorWithModuleId("data/main.datareel/model/image");

            //This ends up calling module-object-descriptor.js:149 - getObjectDescriptorWithModuleId()
            //which causes node to try to phront/node_modules/montage/core/meta/module-object-descriptor.mjson
            //whih is bogus....
            //console.log("Montage.getInfoForObject(objectDescriptor): ", Montage.getInfoForObject(objectDescriptor));

            readOperation = new DataOperation();
            readOperation.type = DataOperation.Type.Read;
            readOperation.dataDescriptor = objectDescriptor.module.id;
            readOperation.criteria = new Criteria().initWithExpression("id == $", "1f9bd2d1-e120-4214-8ff1-273fd49c3a14");

            //Serialize operation
            var serializedOperation = serializer.serializeObject(readOperation),
                deserializedOperation,
                objectRequires,
                module,
                isSync = true,
                resultOperatationPromise,
                self = this,
                completedSerializedOperation;

            deserializer.init(serializedOperation, require, objectRequires, module, isSync);
            deserializedOperation = deserializer.deserializeObject();

            phrontService.handleRead(deserializedOperation)
            .then(function(operationCompleted) {
                //serialize
                completedSerializedOperation = serializer.serializeObject(operationCompleted);
                console.log("completedSerializedOperation:",completedSerializedOperation);

            },function(operationFailed) {
                //serialize
                return self._serializer.serializeObject(operationFailed);
            });
        */


        //"can feth an image from an id using operationCoordinator"
        /*
            //Create a ReadOperation
            var objectDescriptor = phrontService.objectDescriptorWithModuleId("data/main.datareel/model/image");

            //console.log("Montage.getInfoForObject(objectDescriptor): ", Montage.getInfoForObject(objectDescriptor));

            readOperation = new DataOperation();
            readOperation.type = DataOperation.Type.Read;
            readOperation.dataDescriptor = objectDescriptor.module.id;
            readOperation.criteria = new Criteria().initWithExpression("id == $", "1f9bd2d1-e120-4214-8ff1-273fd49c3a14");

            //Serialize operation
            var serializedOperation = serializer.serializeObject(readOperation);

            //Simulate the event passed by the socket:
            operationCoordinator.handleEvent({
                "body":serializedOperation
            })
            .then(function(serializedCompletedOperation) {
                    // //Deserialize operation
                    var deserializedOperation,
                    objectRequires,
                    module,
                    isSync = true;

                    deserializer.init(serializedCompletedOperation, require, objectRequires, module, isSync);
                    deserializedOperation = deserializer.deserializeObject();

                console.log("deserializedOperation:",deserializedOperation);

            },
            function(serializedFailedOperation) {
                console.log("serializedFailedOperation:",serializedFailedOperation);
            });
        */

        // it("can feth a collection and its products", function (done) {

/*

                var collectionQuery = DataQuery.withTypeAndCriteria(ClientCollection),
                    collectionDataStream =  new DataStream();

                collectionDataStream.query = collectionQuery;

                clientMainService.fetchData(
                    collectionQuery,
                    null,
                    collectionDataStream
                ).then(
                    function (collections) {
                        console.log("collections: collections");

                        var serializedCollections = serializer.serializeObject(collections);
                        var dataKBSize = sizeof(serializedCollections) / 1024;
                        console.log("serializedCollections is "+dataKBSize+"KB");

                        resolve(collections);
                    },
                    function (error) {
                        reject(error);
                    }
                );

        // });
*/


        // it("can feth a collection and its products", function (done) {
        /*
            function getServiceDescriptionHtml(aService) {
                //Cheat to test the implementation for now.
                //return phrontClientService.fetchObjectProperty.call(mainService,aService,"descriptionHtml")
                return phrontClientService.fetchObjectProperty(aService,"descriptionHtml")
                // return clientMainService.getObjectProperties(aService,["descriptionHtml"])
                .then(function(resolved) {
                    console.log(aService.title+" descriptionHtml is:"+aService.descriptionHtml);
                    return aService;
                });

            }


            var collectionQuery = DataQuery.withTypeAndCriteria(ClientCollection),
                collectionDataStream =  new DataStream();

            collectionDataStream.query = collectionQuery;

            mainService.fetchData(
                collectionQuery,
                null,
                collectionDataStream
            ).then(
                function (collections) {
                    console.log("collections: collections");

                    // var serializedCollections = serializer.serializeObject(collections);
                    // var dataKBSize = sizeof(serializedCollections) / 1024;
                    // console.log("serializedCollections is "+dataKBSize+"KB");

                    for(var i=0, countI = collections.length, iCollection, iProducts, promises = [];(i<countI);i++) {
                        iCollection = collections[i];
                        iProducts = iCollection.products;

                        if(iProducts) {
                            for(var j=0, countJ = iProducts.length, jProduct;(j<countJ);j++ ) {
                                jProduct = iProducts[j];
                                promises.push(getServiceDescriptionHtml(jProduct));
                            }
                        }
                    }

                    Promise.all(promises)
                    .then(function(resolved) {
                        resolve(collections);
                    })
                },
                function (error) {
                    reject(error);
                }
            );
    */
    // });

    // it("can create, update and delete a collection", function (done) {

        var aCollection =  clientMainService.createDataObject(ClientCollection);

        aCollection.originId = null;
        aCollection.title = "Test Collection Title";
        aCollection.description = "Test Collection description";
        aCollection.descriptionHtml = "Test Collection descriptionHtml";
        aCollection.products = null;
        aCollection.image = null;

        return clientMainService.saveDataObject(aCollection)
        .then(function(createCompletedOperation) {
            return createCompletedOperation.data;
        },function(createFailedOperation) {
            console.error(error);
        })
        .then(function(saveOperationResolved) {
            /* change a simple property */
            aCollection.title = "---> Test Collection Title Changed";
            return clientMainService.saveDataObject(aCollection);
        },function(error) {
            console.error(error);
        })
        .then(function(saveOperationResolved) {
            /* change a simple property and a to-one*/

            var imageDescriptor = clientMainService.objectDescriptorForType(ClientImage);

            var clientImage = clientMainService.createDataObject(imageDescriptor);
            clientImage.originId = null;
            clientImage.altText = "altText";
            clientImage.originalSrc = "http://originalSrc.com/image.png";
            clientImage.transformedSrc = null;
            aCollection.image = clientImage;
            aCollection.title = "Test Collection Title Changed again";

            //Totally new to test
            //return mainService.saveChanges();
            return Promise.all([
                clientMainService.saveDataObject(aCollection.image),
                clientMainService.saveDataObject(aCollection)]);
        },function(saveError) {
            console.error(saveError);
        })
        .then(function(saveCompletedOperation) {
            var collection = saveCompletedOperation.data;

            return Promise.all([
                clientMainService.deleteDataObject(collection.image),
                clientMainService.deleteDataObject(collection)]);

        },function(saveFailedOperation) {
            console.error(saveFailedOperation);
        });

    // });

});
