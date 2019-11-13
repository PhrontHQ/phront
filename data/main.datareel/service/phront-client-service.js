var RawDataService = require("montage/data/service/raw-data-service").RawDataService,
    Criteria = require("montage/core/criteria").Criteria,
    ObjectDescriptor = require("montage/core/meta/object-descriptor").ObjectDescriptor,
    DataQuery = require("montage/data/model/data-query").DataQuery,
    DataStream = require("montage/data/service/data-stream").DataStream,
    Montage = require("montage").Montage,
    Promise = require("montage/core/promise").Promise,
    uuid = require("montage/core/uuid"),
    DataOrdering = require("montage/data/model/data-ordering").DataOrdering,
    DESCENDING = DataOrdering.DESCENDING,
    evaluate = require("montage/frb/evaluate"),
    Set = require("montage/collections/set"),

    
    DataOperation = require("montage/data/service/data-operation").DataOperation,
    uuid = require("montage/core/uuid"),
    PhrontClientService;



    /**
* TODO: Document
*
* @class
* @extends RawDataService
*/
exports.PhrontClientService = PhrontClientService = RawDataService.specialize(/** @lends PhrontClientService.prototype */ {
    constructor: {
        value: function PhrontClientService() {
            this.super();

            this._socket = new WebSocket("wss://77z1bsd4pb.execute-api.us-west-2.amazonaws.com/dev");

            this._socket.addEventListener("open", this);
            this._socket.addEventListener("error", this);
            this._socket.addEventListener("close", this);
            this._socket.addEventListener("message", this);

            this._streamByOperationId = new Map();

            this._socketOpenPromise = new Promise(function(resolve, reject) {
                self._socketOpenPromiseResolve = resolve;
                self._socketOpenPromiseReject = reject;
            });


            return this;
        }
    },

    handleOpen: {
        value: function (event) {
            console.log("WebSocket opened");
            self._socketOpenPromiseResolve(true);
            //this._socket.send("Echo....");
            //this.dispatchEvent(event, true, false);
        }
    },

    handleError: {
        value: function (event) {
            console.error("WebSocket error:", event);
        }
    },

    handleMessage: {
        value: function (event) {
            var operation;
            console.log("received socket message ",event);
            try {
                operation = JSON.parse(event.data);
            } catch (e) {
                return console.warn("Invalid WebSocket message format:", event.data);
            }

            if(operation) {
                var referrerId = operation.referrerId,
                type = operation.type,
                records = operation.data,
                stream = this._streamByOperationId.get(referrerId);

                if(records && records.length > 0) {
  
                    //We pass the map key->index as context so we can leverage it to do record[index] to find key's values as returned by RDS Data API
                    this.addRawData(stream, records);   
                    this.rawDataDone(stream);    
                }
  
            }
  

            // event.detail = parsed;
            // this.dispatchEvent(event, true, false);
        }
    },

    handleClose: {
        value: function () {
            console.log("WebSocket closed");
            this._failedConnections++;
            if (this._failedConnections > 5) {
                // The token we're trying to use is probably invalid, force
                // sign in again
                window.location.reload();
            }
            //this._stopHeartbeat();
        }
    },

    fetchData: {
        value: function (query, stream) {
            var self = this;

            this._socketOpenPromise.then(function() {
                var objectDescriptor = query.type,
                readOperation = new DataOperation();
    
              //We need to turn this into a Read Operation. Difficulty is to turn the query's criteria into
              //one that doesn't rely on objects. What we need to do before handing an operation over to another context
              //bieng a worker on the client side or a worker on the server side, is to remove references to live objects.
              //One way to do this is to replace every object in a criteria's parameters by it's data identifier.
              //Another is to serialize the criteria.
              readOperation.type = DataOperation.Type.Read;
              readOperation.objectDescriptor = objectDescriptor.module.id;
  
              // if(this.objectDescriptorForObjectDescriptorModuleId(objectDescriptor.module.id) === objectDescriptor ) {
              //         console.log("good");
              // }
  
              //readOperation.criteria = query.criteria;
              readOperation.id = uuid.generate();
  
              self._streamByOperationId.set(readOperation.id, stream);
  
              self._socket.send(JSON.stringify(readOperation));
  
            });
  
          return stream;
        }
    }

});
  