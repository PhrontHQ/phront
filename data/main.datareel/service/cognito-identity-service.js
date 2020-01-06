var UserIdentityService = require("montage/data/service/user-identity-service").UserIdentityService,
    DataOperation = require("montage/data/service/data-operation").DataOperation,
    DataOperationType = require("montage/data/service/data-operation").DataOperationType,
    AmazonCognitoIdentity = require("amazon-cognito-identity-js"),
    AuthenticationDetails = AmazonCognitoIdentity.AuthenticationDetails,
    CognitoUserAttribute = AmazonCognitoIdentity.CognitoUserAttribute,
    CognitoUserPool = AmazonCognitoIdentity.CognitoUserPool,
    CognitoUser = AmazonCognitoIdentity.CognitoUser,
    UserIdentity = require("data/main.datareel/model/user-identity").UserIdentity,
    Criteria = require("montage/core/criteria").Criteria,
    uuid = require("montage/core/uuid");


/*
    TODO:

    As a RawDataService, CognitoIdentityService should map a CognitoUser
    to a Phront User.

*/


CognitoIdentityService = exports.CognitoIdentityService = UserIdentityService.specialize({
    /***************************************************************************
     * Initializing
     */

    constructor: {
        value: function CognitoIdentityService() {
            UserIdentityService.call(this);
            this._usersByName = new Map();
            this._fetchStreamByUser = new WeakMap();
        }
    },

     /***************************************************************************
     * Serialization
     */

    deserializeSelf: {
        value:function (deserializer) {
            this.super(deserializer);

            value = deserializer.getProperty("userPoolId");
            if (value) {
                this.userPoolId = value;
            }

            value = deserializer.getProperty("clientId");
            if (value) {
                this.clientId = value;
            }


        }
    },

    _userIdentityDescriptor: {
        value: undefined
    },

    userIdentityDescriptor: {
        get: function() {
            if(!this._userIdentityDescriptor) {
                this._userIdentityDescriptor = this.rootService.objectDescriptorForType(UserIdentity);
            }
            return this._userIdentityDescriptor;
        }
    },

    userPoolId: {
        value: undefined
    },

    clientId: {
        value: undefined
    },

    CognitoUser: {
        value: CognitoUser
    },

    CognitoUserPool: {
        value: CognitoUserPool
    },

    _userPool: {
        value: undefined
    },
    userPool: {
        get: function() {
            if(!this._userPool) {
                var poolData = {
                    UserPoolId: this.userPoolId,
                    ClientId: this.clientId
                };
                this._userPool = new this.CognitoUserPool(poolData);
            }
            return this._userPool;
        }
    },

    _usersByName: {
        value: undefined
    },
    userNamed: {
        value: function(username) {
            var user = this._usersByName.get(username);
            if(!user) {
                var userData = {
                    Username: username,
                    Pool: this.userPool
                };
                user = new this.CognitoUser(userData);
                if(user) {
                    this._usersByName.set(username,user);
                }
            }
            return user;
        }
    },

    _user: {
        value: undefined
    },
    user: {
        get: function() {
            if(!this._user) {
                //Check if we may have a known current user:
                var cognitoUser = this.userPool.getCurrentUser();

                if(cognitoUser) {
                    this._user = cognitoUser;
                }
            }
            return this._user;
        },
        set: function(value) {
            this._user = value;
        }
    },
    userSession: {
        value: undefined
    },

    providesAuthorization: {
        value: true
    },
    authorizationPanel: {
        value: "ui/authentication/authentication-panel.reel"
    },

    fetchRawData: {
        value: function (stream) {
            var self = this;
            this._getCachedCognitoUser()
            .then(function (cognitoUser) {
                var userIdentity, userInputOperation;
                if (!cognitoUser) {
                    cognitoUser = self._createAnonymousCognitoUser();
                }
                if (cognitoUser.signInUserSession) {
                    self.addRawData(stream, [cognitoUser]);
                    self.rawDataDone(stream);
                    self.dispatchUserAuthenticationCompleted(cognitoUser);
                    return;
                }
                /*
                    Now we need to bring some UI to the user to be able to continue
                    This is intended to run in a web/service worker at some point, or why not node
                    so we need an event-driven way to signal that we need to show UI.
                    Because this is a fetch, the promise is already handled at the DataStream level
                    The authentication panel needs to provide us some data.
                    The need to show a UI might be driven by the need to confirm a password,
                    or some other reason, so it needs to provide enough info for the authentication
                    panel to do it's job.
                    Knowing the panel and the identity service may be in different thread, they may not be able to address each others. So we should probably use data operations to do the communication anyway
                */
                userIdentity = self.objectForTypeRawData(self.userIdentityDescriptor, cognitoUser);
                self._pendingStream = stream;

                // Keep track of the stream to complete when we get all data
                self._fetchStreamByUser.set(cognitoUser, stream);

                userInputOperation = new DataOperation();
                userInputOperation.type = DataOperation.Type.UserAuthentication;

                // Needs to make that a separate property so this can be the cover that returns ths
                // local object as a convenience over doing it with a new dataDescriptorModuleId property
                userInputOperation.dataDescriptor = self.userIdentityDescriptor.module.id;

                // This criteria should describe the object for which we need input on with the identifier = ....
                // Required when for example requesting an update to a passord
                // What does it mean when we have no idea who the user is?
                // well, we should have an anonymous user created locally nonetheless,
                // or one created with an anonymous user name sent to Cognito?
                // But we can't change a user name once created?
                userInputOperation.criteria = Criteria.withExpression("identifier = $identifier", {
                    identifier: self.dataIdentifierForObject(userIdentity)
                });

                //Specifies the properties we need input for
                userInputOperation.data = userIdentity;
                userInputOperation.requisitePropertyNames = ["username", "password"];
                userInputOperation.dataServiceModuleId = module.id;
                userInputOperation.authorizationPanelRequireLocation = require.location;
                userInputOperation.authorizationPanelModuleId = require.resolve(self.authorizationPanel);
                self.userIdentityDescriptor.dispatchEvent(userInputOperation);

                // Now the fetch will hang, until a saveDataObject picks up this pending stream
                // and adds the raw data of an authenticated user to it
            })
            .catch(function (err) {
                self.rawDataError(stream, err);
                self.rawDataDone(stream);
            });
        }
    },

    _getCachedCognitoUser: {
        value: function () {
            var self = this,
                cognitoUser = this.userPool.getCurrentUser();
            return new Promise(function (resolve, reject) {
                if (!cognitoUser) {
                    return resolve(null);
                } else if (cognitoUser.signInUserSession && cognitoUser.signInUserSession.isValid()) {
                    return resolve(cognitoUser);
                }
                cognitoUser.getSession(function (err, session) {
                    if (err) {
                        if (err.message === 'Cannot retrieve a new session. Please authenticate.') {
                            return resolve(cognitoUser);
                        } else {
                            console.error(err.message || JSON.stringify(err));
                            return reject(err);
                        }
                    }
                    // NOTE: getSession must be called to authenticate user before calling getUserAttributes
                    /*
                    from: https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-with-identity-providers.html
                    from: https://forums.aws.amazon.com/thread.jspa?threadID=309444
                    See also: https://serverless-stack.com/chapters/mapping-cognito-identity-id-and-user-pool-id.html
                    */
                    cognitoUser.id = cognitoUser.signInUserSession.idToken.payload.sub;
                    resolve(self._fetchUserDataForCognitoUser(cognitoUser));
                });
            });
        }
    },

    _fetchUserDataForCognitoUser: {
        value: function (cognitoUser) {
            return new Promise(function (resolve, reject) {
                // user attributes (email, phone, etc.) and MFA options are
                // not normally on a CognitoUser, but that makes it hard to use
                // a CognitoUser as raw data
                cognitoUser.getUserData(function (err, userData) {
                    if (err) {
                        return reject(err);
                    }
                    cognitoUser.isSmsMfaEnabled = false;
                    if (userData.MFAOptions) {
                        userData.MFAOptions.forEach(function (mfaOption) {
                            if (mfaOption.AttributeName === "phone_number" && mfaOption.DeliveryMedium === "SMS") {
                                cognitoUser.isSmsMfaEnabled = true;
                            }
                        });
                    }
                    userData.UserAttributes.forEach(function (userAttribute) {
                        var name = userAttribute.Name,
                            value = userAttribute.Value;
                        if (name === "email") {
                            cognitoUser.email = value;
                        } else if (name === "phone_number") {
                            cognitoUser.phone = value;
                        }
                    });
                    resolve(cognitoUser);
                });
            });
        }
    },

    _createAnonymousCognitoUser: {
        value: function () {
            var cognitoUser = new this.CognitoUser({
                Username: "",
                Pool: this.userPool
            });
            cognitoUser.id = uuid.generate();
            return cognitoUser;
        }
    },

    dispatchUserAuthenticationCompleted: {
        value: function(userIdentity) {
            var dataOperation = new DataOperation();

            dataOperation.type = DataOperation.Type.UserAuthenticationCompleted;
            dataOperation.dataDescriptor = this.userIdentityDescriptor.module.id;
            dataOperation.data = userIdentity;

            this.userIdentityDescriptor.dispatchEvent(dataOperation);
        }
    },

    dispatchUserAuthenticationFailed: {
        value: function(userIdentity) {
            var dataOperation = new DataOperation();

            dataOperation.type = DataOperation.Type.UserAuthenticationFailed;
            dataOperation.dataDescriptor = this.userIdentityDescriptor.module.id;
            dataOperation.data = userIdentity;

            this.userIdentityDescriptor.dispatchEvent(dataOperation);
        }
    },

    saveRawData: {
        value: function (record, object) {
            var self = this,
                cognitoUser = this.snapshotForDataIdentifier(object.identifier);
            if (cognitoUser) {
                cognitoUser.username = record.username;
                if (cognitoUser.signInUserSession) {
                    if (!object.isAuthenticated) {
                        cognitoUser.signOut();
                    } else if (object.password && object.newPassword) {
                        return this._changePassword(record, object, cognitoUser);
                    }
                    return Promise.resolve();
                } else if (object.accountConfirmationCode) {
                    //This will do for now, but it needs to be replaced by the handling of an updateOperation which
                    //would carry directly the fact that the accountConfirmationCode property
                    //is what changed. In the meantime, while we're still in the same thred, we could ask the mainService what's the changed properties for that object, but it's still not tracked properly for some properties that don't have triggers doing so. Needs to clarify that.
                    return this._confirmUser(record, object, cognitoUser)
                    .then(function () {
                        return self._authenticateUser(record, object, cognitoUser);
                    });
                } else {
                    return this._authenticateUser(record, object, cognitoUser);
                }
            } else {
                return this._signUpUser(record, object);
            }
        }
    },

    _authenticateUser: {
        value: function (record, object, cognitoUser) {
            var self = this,
                authenticationDetails = new AuthenticationDetails({
                    Username: record.username,
                    Password: record.password
                }),
                stream = this._fetchStreamByUser.get(cognitoUser);
            return new Promise(function (resolve, reject) {
                var callback = {
                    onSuccess: function () {
                        var rawDataPrimaryKey = cognitoUser.signInUserSession.idToken.payload.sub,
                            dataIdentifier = object.identifier;
                        //If we had a temporary object, we need to update the primary key
                        if (dataIdentifier && dataIdentifier.primaryKey !== rawDataPrimaryKey) {
                            dataIdentifier.primaryKey = rawDataPrimaryKey;
                        } else if (!dataIdentifier) {
                            dataIdentifier = self.dataIdentifierForTypeRawData(self.userIdentityDescriptor, cognitoUser);
                            self.rootService.recordDataIdentifierForObject(dataIdentifier, object);
                            self.rootService.recordObjectForDataIdentifier(object, dataIdentifier);
                            self.recordSnapshot(dataIdentifier, cognitoUser);
                        }
                        object.session = cognitoUser.signInUserSession;
                        object.isAccountConfirmed = true;
                        object.password = undefined;
                        object.newPassword = undefined;
                        object.mfaCode = undefined;
                        self._fetchUserDataForCognitoUser(cognitoUser)
                        .then(function (cognitoUser) {
                            if (stream) {
                                //Or shall we use addData??
                                self.addRawData(stream, [cognitoUser]);
                                self.rawDataDone(stream);
                            }
                            resolve(object);
                            self.dispatchUserAuthenticationCompleted(object);
                        }, reject);
                    },

                    onFailure: function (err) {
                        if (err.code === "NotAuthorizedException") {
                            var updateOperation = new DataOperation();
                            updateOperation.type = DataOperation.Type.UserAuthenticationFailed;
                            updateOperation.dataDescriptor = self.userIdentityDescriptor.module.id;
                            updateOperation.userMessage = err.message;
                            updateOperation.data = {
                                "username": undefined,
                                "password": undefined,
                            };
                            reject(updateOperation);
                        } else if (err.code === "UserNotConfirmedException") {
                            object.isAccountConfirmed = false;

                            if (object.accountConfirmationCode) {
                                //The user is already entering a accountConfirmationCode
                                //But it's not correct.
                                var validateOperation = new DataOperation();
                                validateOperation.type = DataOperation.Type.ValidateFailed;
                                validateOperation.userMessage = "Invalid Verification Code";
                                validateOperation.dataDescriptor = self.userIdentityDescriptor.module.id;

                                /*
                                    this should describe the what the operation applies to
                                */
                                validateOperation.criteria = new Criteria().initWithExpression("identifier == $", object.identifier);

                                /*
                                    this is meant to provide the core of what the operation express. A validateFailed should explain
                                    what failed.
                                */
                                validateOperation.data = {
                                    "accountConfirmationCode": undefined
                                };

                                reject(validateOperation);
                            } else {
                                //We re-send it regardless to make it easy:
                                cognitoUser.resendConfirmationCode(function(resendConfirmationCodeError, result) {
                                    if (resendConfirmationCodeError) {
                                        //If that fails, not sure what we can do next?
                                        reject(resendConfirmationCodeError);
                                        if(stream) {
                                            self.rawDataError(stream,resendConfirmationCodeError);
                                        }
                                    } else {
                                        /*
                                            console.log('result: ' + result);
                                            {
                                            "CodeDeliveryDetails": {
                                                "AttributeName":"email",
                                                "DeliveryMedium":"EMAIL",
                                                "Destination":"m***@g***.com"}
                                            }
                                            The message communicated to the user should use this
                                            to craft the right message indicating the medium used
                                            to send the confirmation code (email, SMS..) and the obfuscated details of the address/id used for that medium.
                                        */
                                        /*
                                            This needs to be handled in a way that it triggers the authentication
                                            panel to show the code verification sub-panel.

                                            Here we're using an update to sollicitate an input for the confirmation code, should it be a validateFailed operation instead?
                                            */
                                        var updateOperation = new DataOperation();
                                        updateOperation.type = DataOperation.Type.Update;
                                        // updateOperation.dataDescriptor = objectDescriptor.module.id;
                                        //Hack
                                        updateOperation.dataDescriptor = self.userIdentityDescriptor.module.id;

                                        /*
                                            Should be the criteria matching the UserIdentity
                                            whose password needs to change
                                        */
                                        //updateOperation.criteria = query.criteria;

                                        /*
                                            gives some information. It might be easier to use
                                            if the operation was more specific and hand more clearly defined properties?
                                        */
                                        updateOperation.context = result;

                                        updateOperation.data = {
                                            "accountConfirmationCode": undefined
                                        };

                                        reject(updateOperation);
                                    }
                                });
                            }
                        } else if (err.code === "CodeMismatchException") {
                            dataOperation = new DataOperation();
                            dataOperation.type = DataOperation.Type.ValidateFailed;
                            dataOperation.userMessage = "Invalid MFA Code";
                            dataOperation.dataDescriptor = self.userIdentityDescriptor.module.id;
                            dataOperation.criteria = new Criteria().initWithExpression("identifier == $", object.identifier);
                            dataOperation.data = { mfaCode: undefined };
                            reject(dataOperation);
                        } else {
                            reject(err);
                            //reject(err.message || JSON.stringify(err));

                            if(stream) {
                                self.rawDataError(stream,err);
                            }
                        }
                    },

                    mfaRequired: function (codeDeliveryDetails) {
                        var updateOperation = new DataOperation();
                        updateOperation.type = DataOperation.Type.Update;
                        updateOperation.dataDescriptor = self.userIdentityDescriptor.module.id;
                        updateOperation.context = {
                            codeDeliveryDetails: codeDeliveryDetails
                        };
                        updateOperation.data = {
                            "mfaCode": undefined
                        };
                        object.isMfaEnabled = cognitoUser.isSmsMfaEnabled = true;
                        reject(updateOperation);
                    },

                    newPasswordRequired: function (userAttributes, requiredAttributes) {
                        var updateOperation = new DataOperation();
                        updateOperation.type = DataOperation.Type.Update;
                        // updateOperation.dataDescriptor = objectDescriptor.module.id;
                        //Hack
                        updateOperation.dataDescriptor = self.userIdentityDescriptor.module.id;
                        //Should be the criteria matching the User
                        //whose password needs to change
                        //updateOperation.criteria = query.criteria;
                        //Hack for now
                        updateOperation.context = {
                            userAttributes: userAttributes,
                            requiredAttributes: requiredAttributes
                        };
                        updateOperation.data = {
                            "password": undefined
                        };

                        // the api doesn't accept these fields back
                        delete userAttributes.email_verified;
                        delete userAttributes.phone_number_verified;

                        // store userAttributes on global variable
                        self.sessionUserAttributes = userAttributes;

                        reject(updateOperation);
                    }
                };
                if (object.newPassword && self.sessionUserAttributes) {
                    cognitoUser.completeNewPasswordChallenge(object.newPassword, self.sessionUserAttributes, callback);
                } else if (object.mfaCode) {
                    cognitoUser.sendMFACode(object.mfaCode, callback);
                } else {
                    cognitoUser.authenticateUser(authenticationDetails, callback);
                }
            });
        }
    },

    _signUpUser: {
        value: function (record, object) {
            var self = this,
                stream = this._pendingStream,
                cognitoUserAttributes = [
                    new CognitoUserAttribute({
                        Name: 'email',
                        Value: record.email
                    })
                ];
            return new Promise(function (resolve, reject) {
                self.userPool.signUp(record.username, record.password, cognitoUserAttributes, null, function (err, result) {
                    var cognitoUser, dataOperation, dataIdentifier;
                    if (err) {
                        if (err.code === "UsernameExistsException") {
                            cognitoUser = self.snapshotForDataIdentifier(object.identifier);
                            if (!cognitoUser) {
                                cognitoUser = new self.CognitoUser({
                                    Username: record.username,
                                    Pool: self.userPool
                                });
                                cognitoUser.id = uuid.generate();
                                if (stream) {
                                    self._fetchStreamByUser.set(cognitoUser, stream);
                                }
                            }

                            //Since it exists, we try to authenticate with what we have
                            self._authenticateUser(record, object, cognitoUser)
                            .then(function () {
                                //It worked we're all good
                                resolve();
                            }, function (error) {
                                //Authentication failed, since the username exists,
                                //It's likely the passord is wrong.
                                //We need to communicate that back up
                                //and make sure we switch bacl to the signin panel
                                reject(error);
                            });
                        } else if (err.code === "InvalidParameterException") {
                            dataOperation = new DataOperation();
                            dataOperation.type = DataOperation.Type.ValidateFailed;
                            dataOperation.dataDescriptor = self.userIdentityDescriptor.module.id;
                            dataOperation.userMessage = err.message;
                            dataOperation.data = {};
                            if (err.message.indexOf("username") !== -1) {
                                dataOperation.data["username"] = undefined;
                            }
                            if (err.message.indexOf("password") !== -1) {
                                dataOperation.data["password"] = undefined;
                            }
                            if (err.message.indexOf("email") !== -1) {
                                dataOperation.data["email"] = undefined;
                            }
                            reject(dataOperation);
                        } else {
                            reject(err);
                        }
                    } else {
                        cognitoUser = result.user;
                        cognitoUser.id = uuid.generate();
                        dataIdentifier = object.identifier;
                        if (dataIdentifier) {
                            dataIdentifier.primaryKey = cognitoUser.id;
                        } else {
                            dataIdentifier = self.dataIdentifierForTypeRawData(self.userIdentityDescriptor, cognitoUser);
                            self.rootService.recordDataIdentifierForObject(dataIdentifier, object);
                            self.rootService.recordObjectForDataIdentifier(object, dataIdentifier);
                        }
                        self.recordSnapshot(object.identifier, cognitoUser);
                        object.isAccountConfirmed = false;
                        //For the saveRawData...
                        resolve(object);
                        //For the fetch for a user identity
                        if(stream) {
                            if(stream.data.length === 1) {
                                //we've already created a user identity...
                                //we need to remove it... fingers crossed
                                stream.data.splice(0,1); //it is done....
                            }
                            self.addRawData(stream, [cognitoUser]);
                            self.rawDataDone(stream);
                        }
                    }
                });
            });
        }
    },

    _confirmUser: {
        value: function(record, object, cognitoUser) {
            var self = this,
                accountConfirmationCode = object.accountConfirmationCode;
            return new Promise(function (resolve, reject) {
                cognitoUser.confirmRegistration(accountConfirmationCode, true, function (err) {
                    var dataOperation;
                    if (err) {
                        dataOperation = new DataOperation();
                        dataOperation.type = DataOperation.Type.ValidateFailed;
                        dataOperation.userMessage = "Invalid Verification Code";
                        dataOperation.dataDescriptor = self.userIdentityDescriptor.module.id;
                        dataOperation.criteria = new Criteria().initWithExpression("identifier == $", object.identifier);
                        dataOperation.data = { accountConfirmationCode: undefined };
                        reject(dataOperation);
                    } else {
                        object.accountConfirmationCode = undefined;
                        resolve();
                    }
                });
            });
        }
    },

    _changePassword: {
        value: function (record, object, cognitoUser) {
            var self = this;
            return new Promise(function (resolve, reject) {
                cognitoUser.changePassword(object.password, object.newPassword, function (err) {
                    var dataOperation;
                    if (err) {
                        if (err.code === "InvalidPasswordException") {
                            dataOperation = new DataOperation();
                            dataOperation.type = DataOperation.Type.ValidateFailed;
                            dataOperation.dataDescriptor = self.userIdentityDescriptor.module.id;
                            dataOperation.userMessage = err.message;
                            dataOperation.data = {
                                "password": undefined
                            };
                            reject(dataOperation);
                        } else if (err.code === "NotAuthorizedException") {
                            dataOperation = new DataOperation();
                            dataOperation.type = DataOperation.Type.UserAuthenticationFailed;
                            dataOperation.dataDescriptor = self.userIdentityDescriptor.module.id;
                            dataOperation.userMessage = err.message;
                            dataOperation.data = {
                                "username": undefined,
                                "password": undefined
                            };
                            reject(dataOperation);
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve();
                    }
                });
            });
        }
    },

    _connectionInfo: {
        value: null
    },

    /**
     * Passes information necessary to Auth0 authorization API/libraries
     *      name: standard ConnectionDescriptor property ("production", "development", etc...)
     *      clientId:,{String} Required parameter. Your application's clientId in Auth0.
     *      domain:  {String}: Required parameter. Your Auth0 domain. Usually your-account.auth0.com.
     *      options:  {Object}: Optional parameter. Allows for the configuration of Lock's appearance and behavior.
     *                  See https://auth0.com/docs/libraries/lock/v10/customization for details.
     *
     * enforces that.
     *
     * @class
     * @extends external:Montage
     */
    connectionInfo: {
        get: function() {
            return this._connectionInfo;
        },
        set: function(value) {
            this._connectionInfo = value;
            //TODO Revisit when implementing support for UI Less method directly
            // if(this._connectionDescriptor.clientId && this._connectionDescriptor.domain) {
            //     this._auth0 = new Auth0(
            //         this._connectionDescriptor.clientId,
            //         this._connectionDescriptor.domain
            //         );
            // }
        }
    }

});
