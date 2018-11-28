/**
 * @Author Lukas Steiger, Alexandra de Groof
 * @Copyright (c) 2017, Siemens AG
 */
define([
    "dojo/_base/declare",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dijit/_WidgetsInTemplateMixin",
    "dijit/Tooltip",
    "dojo/Deferred",
    "dojo/on",
    "dojo/promise/all",
    "dojo/query",
    "dojo/dom-construct",
    "./XhrHelpers",
    "./JazzHelpers",
    "dojo/text!./templates/Presentation.html",
    "com.ibm.team.repository.web.client.session.Session",
    "dojo/domReady!",
], function (declare, _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, Tooltip, Deferred, on, all, query, domConstruct, XHR, JAZZ, template) {

    var getAuthenticatedContributor = com.ibm.team.repository.web.client.session.getAuthenticatedContributor;
    return declare("com.siemens.bt.jazz.rtc.workItemEditor.presentation.roles.ui.Presentation", [_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {

        _classProperties: {instanceID: 0},
        instanceID: null,
        templateString: null,

        constructor: function (args) {
            this.instanceID = ++this._classProperties.instanceID;
            this.inherited(arguments, []);
            this.templateString = template;
            //this.initStateSize = 3;
            this.paId = args.workItem.attributes.projectArea.id;

            // Create a listener for filed against changes
            var listener = {
                path: ["attributes", "category"],
                event: "onchange",
                listener: this,
                functionName: "changeFunc"
            };

            // Add the listener to the work item
            args.workingCopy.addListener(listener);
            //Show roles on page load
            this.showRoles(args.workItem.attributes.category.id);

        },

        //gets called if filed against changes
        changeFunc: function (event) {
            this.showRoles(event.value.id);//id of cat
        },

        //reads roles from xml and returns them as string
        extractRoles: function (result) {
            var memberXml = dojox.xml.parser.parse(result[0][1]); //the member info xml
            var roleXml = dojox.xml.parser.parse(result[1][1]); //the roles with label xml
            var roleLabels = [];
            var roleUris = memberXml.querySelectorAll("role-url"); //get all role(urls) user has
            var roles = roleXml.querySelectorAll("role");

            for (var j = 0; j < roles.length; j++) {

                var roleUri = roles[j].querySelector("url");

                // search for each roles name in roleXml
                for (var i = 0; i < roleUris.length; i++) {
                    if (roleUris[i].textContent === roleUri.textContent) {
                        roleLabels.push(roles[j].querySelector("label").textContent);
                    }
                }
            }
            //make a nice string
            return roleLabels.filter(function (e) {
                return e !== "default" ? e : null;
            }).sort().join(", ");
        },

        //if member isn't in pa search up the hierarchy
        searchUp: function () {
            if (this.processAreaid === this.paId) {
                return ""; //no need to build hierarchy if already at project level
            }
            return jazz.client.xhrGet({
                url: JAZZ.getApplicationBaseUrl() + "service/com.ibm.team.process.internal.service.web.IProcessWebUIService/" +
                    "teamAreaByUUIDWithLimitedMembers?processAreaItemId=" + this.processAreaid + "&maxMembers=20",
            }).then((function (hierarchyResult) {
                var hierarchiesXML = dojox.xml.parser.parse(hierarchyResult);
                this.hierarchy = hierarchiesXML.querySelector("processHierarchy").querySelectorAll("itemId"); //get itemids that are part of hir.
                return this.searchForMemberAgain();

            }).bind(this));
        },

        //search for member in the n-th processarea
        searchForMemberAgain: function () {
            if (this.processAreaid === this.paId) {
                return ""; //stop if pa
            }
            //set paid to parent
            this.processAreaid = this.findParent(this.hierarchy, this.processAreaid);
            //get memberpage if exist, else calls itself
            var paUrl = JAZZ.getApplicationBaseUrl() +
                "process/project-areas/" + this.paId;
            if (this.paId !== this.processAreaid) {
                paUrl += "/team-areas/" + this.processAreaid;
            }
            paUrl = paUrl + "/members/" + getAuthenticatedContributor().userId;
            return jazz.client.xhrGet({
                url: paUrl,
                error: this.searchForMemberAgain.bind(this)
            }).then(
                function (result) {
                    return result; //finally found permissions
                }
            );
        },

        //returns itemId of parent ta or pa
        findParent: function (hierarchy, target) {
            for (var i = 0; i < hierarchy.length; i++) {
                if (hierarchy[i].textContent === target) {
                    return hierarchy[i].parentNode.parentNode.querySelector("itemId").textContent;
                }
            }

        },

        showRoles: function (categoryId) {
            //get available data
            var user = getAuthenticatedContributor().userId; //todo
            var projectUuid = this.paId; //todo no?
            var webUrl = JAZZ.getApplicationBaseUrl();
            var self = this;
            //get ta id belonging to category
            var categoriesCall = jazz.client.xhrGet({
                url: webUrl +
                    "service/com.ibm.team.workitem.common.internal.rest.IWorkItemRestService/workItemCategories?projectAreaItemId=" +
                    projectUuid,
                error: function () {
                    return 0;
                }
            }).then((function (categoriesResult) {
                var categoriesXml = dojox.xml.parser.parse(categoriesResult);
                var categories = categoriesXml.querySelectorAll("values");
                for (var k = 0; k < categories.length; k++) {
                    var cat = categories[k];
                    this.processAreaid = projectUuid;
                    if (cat.querySelector("itemId").textContent === categoryId) {
                        //found right category, now get roles of member and their labels
                        var paUrl = webUrl +
                            "process/project-areas/" + projectUuid;
                        if (cat.querySelector("defaultTeamArea")) {
                            paUrl += "/team-areas/" + cat.querySelector("defaultTeamArea").textContent;
                            this.processAreaid = cat.querySelector("defaultTeamArea").textContent;
                        }
                        memberUrl = paUrl + "/members/" + user;
                        roleUrl = paUrl + "/roles";
                        var memberCall = jazz.client.xhrGet({
                            url: memberUrl,
                            error: self.searchUp.bind(this)
                        });

                        var roleCall = jazz.client.xhrGet({
                            url: roleUrl
                        });
                        //once roles and labels are found match them and make string
                        var calls = new dojo.DeferredList([memberCall, roleCall]);
                        return calls.then(self.extractRoles);
                    }
                }

            }).bind(this));

            return categoriesCall.then(function (res) {
                if (res === "") {
                    res = "You're not assigned any role, except the default."
                }
                self.roleContainer.innerHTML = res;
            });

        }


    });
});