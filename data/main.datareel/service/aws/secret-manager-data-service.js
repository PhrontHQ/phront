var AWS = require('aws-sdk'),
    DataService = require("montage/data/service/data-service").DataService,
    RawDataService = require("montage/data/service/raw-data-service").RawDataService,
    SyntaxInOrderIterator = require("montage/core/frb/syntax-iterator").SyntaxInOrderIterator,
    DataOperation = require("montage/data/service/data-operation").DataOperation,
    S3DataService;



/**
* TODO: Document
*
* @class
* @extends RawDataService
*/
exports.SecretManagerDataService = SecretManagerDataService = RawDataService.specialize(/** @lends SecretManagerDataService.prototype */ {

    /***************************************************************************
     * Initializing
     */

    constructor: {
        value: function SecretManagerDataService() {
            RawDataService.call(this);

            var mainService = DataService.mainService;
            mainService.addEventListener(DataOperation.Type.ReadOperation,this,false);

            return this;
        }
    },

    handleCreateTransactionOperation: {
        value: function (createTransactionOperation) {

            /*
                S3 doesn't have the notion of transaction, but we still need to find a way to make it work.
            */

        }
    },

    _connection: {
        value: undefined
    },

    connection: {
        get: function() {
            if(!this._connection) {
                this.connection = this.connectionForIdentifier(this.currentEnvironment.stage);
            }
            return this._connection;
        },
        set: function(value) {

            if(value !== this._connection) {
                this._connection = value;
            }
        }
    },

    __SecretsManager: {
        value: undefined
    },

    _SecretsManager: {
        get: function () {
            if (!this.__SecretsManager) {
                var connection = this.connection;

                if(connection) {
                    var region;

                    if(connection.region) {
                        region = connection.region;
                    } else if(connection.resourceArn) {
                        region = connection.resourceArn.split(":")[3];
                    }

                    var SecretsManagerOptions =  {
                        apiVersion: '2017-10-17',
                        region: region
                    };

                    var credentials = new AWS.SharedIniFileCredentials({profile: connection.profile});
                    if(credentials && credentials.accessKeyId !== undefined && credentials.secretAccessKey !== undefined) {
                        SecretsManagerOptions.credentials = credentials;
                    } else {
                        SecretsManagerOptions.accessKeyId = process.env.aws_access_key_id;
                        SecretsManagerOptions.secretAccessKey = process.env.aws_secret_access_key;
                    }

                    this.__SecretsManager = new AWS.SecretsManager(SecretsManagerOptions);;

                } else {
                    throw "SecretsManager could not find a connection for stage - "+this.currentEnvironment.stage+" -";
                }

            }
            return this.__SecretsManager;
        }
    },

    handleSecretReadOperation: {
        value: function (readOperation) {
            /*
                Until we solve more efficiently (lazily) how RawDataServices listen for and receive data operations, we have to check wether we're the one to deal with this:
            */
            if(!this.handlesType(readOperation.target)) {
                return;
            }

            //console.log("S3DataService - handleObjectReadOperation");

            var self = this,
                data = readOperation.data,
                objectDescriptor = readOperation.target,
                mapping = objectDescriptor && this.mappingForType(objectDescriptor),
                primaryKeyPropertyDescriptors = mapping && mapping.primaryKeyPropertyDescriptors,

                criteria = readOperation.criteria,
                parameters = criteria.parameters,
                // iterator = new SyntaxInOrderIterator(criteria.syntax, "property"),
                secretId = parameters && parameters.name,
                rawData,
                promises,
                operation;

            if(secretId) {
                /*
                    This params returns a data with these keys:
                    ["AcceptRanges","LastModified","ContentLength","ETag","ContentType","ServerSideEncryption","Metadata","Body"]
                */

                (promises || (promises = [])).push(new Promise(function(resolve, reject) {
                    self._SecretsManager.getSecretValue({
                        SecretId: secretId
                    }, function (err, data) {
                        if (err) {
                            /*

                                if (err.code === 'DecryptionFailureException')
                                    // Secrets Manager can't decrypt the protected secret text using the provided KMS key.
                                    // Deal with the exception here, and/or rethrow at your discretion.
                                    reject(err);
                                else if (err.code === 'InternalServiceErrorException')
                                    // An error occurred on the server side.
                                    // Deal with the exception here, and/or rethrow at your discretion.
                                    reject(err);
                                else if (err.code === 'InvalidParameterException')
                                    // You provided an invalid value for a parameter.
                                    // Deal with the exception here, and/or rethrow at your discretion.
                                    reject(err);
                                else if (err.code === 'InvalidRequestException')
                                    // You provided a parameter value that is not valid for the current state of the resource.
                                    // Deal with the exception here, and/or rethrow at your discretion.
                                    reject(err);
                                else if (err.code === 'ResourceNotFoundException')
                                    // We can't find the resource that you asked for.
                                    // Deal with the exception here, and/or rethrow at your discretion.
                                    reject(err);

                            */
                            console.log(err, err.stack); // an error occurred
                            (rawData || (rawData = {}))[data] = err;
                            reject(err);
                        }
                        else {
                            var secret, secretValue;
                            // Decrypts secret using the associated KMS CMK.
                            // Depending on whether the secret is a string or binary, one of these fields will be populated.
                            if ('SecretString' in data) {
                                secret = data.SecretString;
                                // console.log("secret:",secret);
                            } else {
                                let buff = new Buffer(data.SecretBinary, 'base64');
                                secret = decodedBinarySecret = buff.toString('ascii');
                                //console.log("decodedBinarySecret:",decodedBinarySecret);
                            }

                            try {
                                secretValue = JSON.parse(secret);
                            } catch(parseError) {
                                //It's not jSON...
                                secretValue = secret;
                            }
                            (rawData || (rawData = {}))["name"] = data.Name;
                            (rawData || (rawData = {}))["value"] = secretValue;

                            resolve(rawData);
                        }
                    });

                }));

            } else {
                console.log("Not sure what to send back, noOp?")
            }

            if(promises) {
                Promise.all(promises)
                .then(function(resolvedValue) {
                    operation = self.responseOperationForReadOperation(readOperation, null, [rawData], false/*isNotLast*/);
                    objectDescriptor.dispatchEvent(operation);
                }, function(error) {
                    operation = self.responseOperationForReadOperation(readOperation, error, null, false/*isNotLast*/);
                    objectDescriptor.dispatchEvent(operation);
                })
            } else {
                if(!rawData || (rawData && Object.keys(rawData).length === 0)) {
                    operation = new DataOperation();
                    operation.type = DataOperation.Type.NoOp;
                } else {
                    operation = self.responseOperationForReadOperation(readOperation, null /*no error*/, [rawData], false/*isNotLast*/);
                }
                objectDescriptor.dispatchEvent(operation);
            }
        }
    }


});
