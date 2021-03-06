var aTestStr =
`{
    "root": {
        "prototype": "montage/core/meta/module-object-descriptor",
        "values": {
            "name": "Address",
            "propertyDescriptors": [
                {"@": "name"},
                {"@": "firstName"},
                {"@": "lastName"},
                {"@": "phone"},
                {"@": "company"},
                {"@": "address1"},
                {"@": "address2"},
                {"@": "city"},
                {"@": "provinceCode"},
                {"@": "zip"},
                {"@": "country"},
                {"@": "latitude"},
                {"@": "longitude"}
            ],
            "objectDescriptorModule": {
                "%": "data/main.datareel/model/messaging-channel/postal-address.mjson"
            },
            "exportName": "Address",
            "module": {
                "%": "data/main.datareel/model/messaging-channel/postal-address"
            },
            "object":{"@": "address"},
            "parent":{"@": "objectDescriptor"}
        }
    },
    "address": {
        "object": "data/main.datareel/model/messaging-channel/postal-address"
    },
    "objectDescriptor": {
        "object": "data/main.datareel/model/object.mjson"
    },
    "name": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "name",
            "valueType": "string"
        }
    },
    "firstName": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "firstName",
            "valueType": "string"
        }
    },
    "lastName": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "lastName",
            "valueType": "string"
        }
    },
        "phone": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "phone",
            "valueType": "string"
        }
    },
    "company": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "company",
            "valueType": "string"
        }
    },
    "address1": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "address1",
            "valueType": "string"
        }
    },
    "address2": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "address2",
            "valueType": "string"
        }
    },
    "city": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "city",
            "valueType": "string"
        }
    },
    "provinceCode": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "provinceCode",
            "valueType": "string"
        }
    },
    "zip": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "zip",
            "valueType": "string"
        }
    },
    "country": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "country",
            "valueType": "string"
        }
    },
    "latitude": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "latitude",
            "valueType": "number"
        }
    },
    "longitude": {
        "prototype": "montage/core/meta/property-descriptor",
        "values": {
            "name": "longitude",
            "valueType": "number"
        }
    }

}`;

/*
    would using a Proxy help during reviving for future objects like {"@": "name"} ?
*/


var prototypeOwner = null;
var prototypeOwnerValues = null;
var prototypeOwnerListeners = null;
var objectPath = [];

var aTestObj = JSON.parse(aTestStr, function(key, value) {
    //console.log("key:",key,", value:", JSON.stringify(value));
    //at this point, this refers to the object being revived
    //E.g., when key == 'prop1', this is an object with prop1 and prop2
    //when key == prop2B, this is an object with prop2A, prop2B and prop2C
    //So is this code reliable?
    if (key === "prototype"/* or object or value */) {
        prototypeOwner = this;
        objectPath.push(this);
        console.log("prototype/object is "+value);
        //Do something, add a prop to this:
        //this.prop2BDif = 100 - this.prop2B;
    }

    else if (key === "values" && prototypeOwner === this) {
        prototypeOwnerValues = this;
        console.log("values block is "+JSON.stringify(value));
        //Do something, add a prop to this:
        //this.prop2BDif = 100 - this.prop2B;
    }
    else if (key === "listeners" && prototypeOwner === this) {
        prototypeOwnerListeners = this;
        console.log("listeners block is "+JSON.stringify(value));
        //Do something, add a prop to this:
        //this.prop2BDif = 100 - this.prop2B;
    }
    else if(prototypeOwnerValues === this) {
        console.log("values key:",key,", value:", JSON.stringify(value));
    }
    else  {
        console.log("key:",key,", value:", JSON.stringify(value));
    }

    return value;
});

console.log("aTestObj is :",aTestObj);
