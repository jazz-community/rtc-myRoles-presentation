define([
	"dojo/_base/declare",
	"dijit/_WidgetBase",
	"dijit/_TemplatedMixin",
	"dijit/_WidgetsInTemplateMixin",
	"dijit/TooltipDialog",
	"dijit/popup",
	"dojo/Deferred",
	"dojo/on",
	"dojo/promise/all",
	"dojo/query",
	"dojo/dom-construct",
	"./XhrHelpers",
	"./JazzHelpers",
	"dojo/text!./templates/Presentation.html",
	"dojo/dom-class",
	"com.ibm.team.repository.web.client.session.Session",
	"dojo/domReady!",
	"com.ibm.team.workitem.web.client.internal.WorkItemClient",
	"com.ibm.team.workitem.web.process.client.internal.WorkItemConfigClient"
], function (declare, _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, Tooltip, popUp, Deferred, on, all, query, domConstruct, XHR, JAZZ, template, dojoClass) {

	var getAuthenticatedContributor = com.ibm.team.repository.web.client.session.getAuthenticatedContributor;

	var WORK_ITEM_ATTRIBUTES = com.ibm.team.workitem.web.client.internal.WorkItemAttributes;
	var IBM_WORK_ITEM_ATTRIBUTE_PREFIX = "com.ibm.team.workitem.attribute.";

	var NEW_RANKING_ATTRIBUTE_NAMESPACE = "com.ibm.team.apt.attribute.planitem.newRanking._pm7NmRYUEd6L1tNIGdz5qQ";

	return declare("com.siemens.bt.jazz.rtc.workItemEditor.presentation.roles.ui.Presentation", [_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {

		_classProperties: { instanceID: 0 },
		instanceID: null,
		templateString: null,
		original: null, //the original Workitem
		properties: null,

		externalLink: null,
		workingCopy: null,

		constructor: function (args) {
			this.instanceID = ++this._classProperties.instanceID;
			this.inherited(arguments, []);
			this.templateString = template;
			this.original = JSON.parse(JSON.stringify(args.workItem.attributes)); //copies object not reference since listener is on workingcopy and has only the workingcopyvalues
			this.eventHandels = [];
			this.paId = args.workItem.attributes.projectArea.id;
			this.type = args.workItem.attributes.workItemType.id; //todo update ocasonally
			if (!args.workItem.stateId) {
				this.creating = true; //todo does this catch typechange too?
			}

			this.workingCopy = args.workingCopy;

			// Create a listener for filed against changes
			var listener = {
				path: ["attributes", "category"],
				event: "onchange",
				listener: this,
				functionName: "changeFunc"
			};

			// Create a listener for any changes
			var anyListener = {
				path: ["attributes"], //if any are changed
				event: "onchange",
				listener: this,
				functionName: "checkFuncs"
			};

			// Add the listener to the work item
			args.workingCopy.addListener(listener);
			args.workingCopy.addListener(anyListener);

			//getProperties if any
			if (args.presentation.properties) {
				this.properties = args.presentation.properties;
			}

			this._getShape();

			//Show roles on page load
			this.showRoles(args.workItem.attributes.category.id, args.workingCopy);

			// Try to get the external link configuration
			var externalLinkPropertiesValue = JAZZ.getValueFromPresentationProperties("externalLink", args.presentation, null);

			if (externalLinkPropertiesValue) {
				try {
					this.externalLink = JSON.parse(externalLinkPropertiesValue);
				} catch (error) {
					console.error("Failed to parse external link configuration", error);
					this.externalLink = null;
				}
			}
		},

		_getShape: function () {
			this.attributeRoleMap = new Map(); //attributeMap is used by jazz!
			//Asks the "shape" the workitem has, gets back all attributes snd their default values, etc https://localhost:7443/jazz/oslc/context/_-ndcMHOjEeixwK5VwIfp8A/shapes/workitems/task
			XHR.oslcXmlGetRequest(JAZZ.getApplicationBaseUrl() + "oslc/context/" + this.paId + "/shapes/workitems/" + this.type).then((function (result) {

				var attributes = result.querySelectorAll("property");
				for (var i = 0; i < attributes.length; i++) {
					var attribute = {};
					attribute.id = attributes[i].querySelector("Property").getAttributeNode("rdf:about").nodeValue.split("/").pop();
					attribute.title = attributes[i].querySelector("title").innerHTML;
					attribute.name = attributes[i].querySelector("name").innerHTML;
					attribute.defaultHref = attributes[i].querySelector("defaultValue") ? attributes[i].querySelector("defaultValue").innerHTML : null;

					this.attributeRoleMap.set(attribute.id, attribute);
				}

				//Load Values
				this.defaultValueCache = {
					attributes: [],
					attributeTypes: []
				};

				var self = this;

				var srh1 = new com.ibm.team.repository.web.transport.ServiceResponseHandler({
					onSuccess: function (response) {
						if (response && Array.isArray(response)) {
							self.defaultValueCache.attributes.push.apply(self.defaultValueCache.attributes, response);
						}
					},
					onFailure: function (error) {
						console.warn("failure error: ", error);
					}
				}, "onSuccess", "onFailure");

				var srh2 = new com.ibm.team.repository.web.transport.ServiceResponseHandler({
					onSuccess: function (response) {
						self.defaultValueCache.attributeTypes = response;
					},
					onFailure: function (error) {
						console.warn("failure error: ", error);
					}
				}, "onSuccess", "onFailure");

				var appArgs = {
					projectAreaItemId: self.paId
				}

				com.ibm.team.workitem.web.client.internal.WorkItemClient.getAttributes(srh1, appArgs);
				com.ibm.team.workitem.web.process.client.internal.WorkItemConfigClient.setCurrentProjectAreaEditor(appArgs);
				com.ibm.team.workitem.web.process.client.internal.WorkItemConfigClient.getAttributeTypes(srh2, appArgs);

				//**************************************************/
				//**************************************************/
				// Add Ranking to the Lists
				//**************************************************/
				this.defaultValueCache.attributes.push(
					{
						attributeTypeId: "rank",
						isLink: false,
						isEnumeration: false,
						imageURL: null,
						externalId: NEW_RANKING_ATTRIBUTE_NAMESPACE,
						_eQualifiedClassName: "com.ibm.team.workitem.query.rest.dto:UIItemDTO",
						hasNullValue: true,
						label: "Rank",
						id: NEW_RANKING_ATTRIBUTE_NAMESPACE,
						hasValueSet: false,
						nullValue: {
							isHTML: false,
							_eQualifiedClassName: "com.ibm.team.workitem.rest.dto:ContentDTO",
							content: "",
							label: "Unassigned"
						}
					}
				);

				this.attributeRoleMap.set(
					NEW_RANKING_ATTRIBUTE_NAMESPACE,
					{
						id: NEW_RANKING_ATTRIBUTE_NAMESPACE,
						title: "Rank",
						name: "Rank",
						defaultHref: null
					}
				);
				//**************************************************/
				//**************************************************/
				//**************************************************/
				//**************************************************/

			}).bind(this));
		},

		getDefaultAttributeValue: function (attributeId) {

			var attribute = this.defaultValueCache.attributes.find(function (a) {
				return a.id === attributeId;
			});

			if (!attribute) {
				return null;
			}

			if (!attribute.isEnumeration) {
				return attribute.nullValue;
			} else {

				var enumerationType = this.defaultValueCache.attributeTypes.enumerationTypes.find(function (e) {
					return e.id == attribute.attributeTypeId;
				});

				if (!enumerationType || !enumerationType.literals) {
					return null;
				}

				return enumerationType.literals.find(function (i) {
					return i.defaultValue;
				});

			}
		},

		checkFuncs: function (event) {
			var workitem = event.value;
			this.workitem = workitem;
			var paId = workitem.projectArea.id;
			var taId = workitem.teamArea.id;
			var taUrl = JAZZ.getProcessTeamAreaUrl(paId, taId);
			var changedAttributes = event.workingCopy.changedAttributes;

			this.checkPermission(workitem, taUrl, changedAttributes);
		},

		checkPermission: function (workitem, taUrl, changedAttributes) {

			var _this = this;

			var categoryChangeEvent = false;

			// Check if the category has changed
			if (this.original &&
				this.original.category &&
				workitem &&
				workitem.category &&
				this.original.category.label != workitem.category.label &&
				changedAttributes != null &&
				changedAttributes.category != null
			) {

				categoryChangeEvent = true;

				// List with all the Attribute-IDs
				var l = [];

				// Add all the IDs of the Attribute to the list
				WORK_ITEM_ATTRIBUTES.BUILT_IN.forEach(function (element) {
					l.push({
						id: element,
						value: _this.getDefaultAttributeValue(element)
					});
				});

				//Add _newRank to be searched to
				l.push({
					id: NEW_RANKING_ATTRIBUTE_NAMESPACE,
					value: _this.getDefaultAttributeValue(NEW_RANKING_ATTRIBUTE_NAMESPACE)
				});

				// List to Map all the IDs to there default Values
				var dL = [];

				// Set the default Value, to all the found Attribute-IDs
				l.forEach(function (element) {
					var workItemValue = workitem[element.id];
					if (workItemValue && (workItemValue.label != null || workItemValue.content != null)) {

						if (!element.value) {
							element.value = _this.getDefaultAttributeValue(element.id);
						}

						if (element.value && element.value.label == undefined) {
							element.value.label = (element.value.name != undefined ? element.value.name : "");
						}

						if (
							(element.value) &&
							(
								(workItemValue.label && workItemValue.label != element.value.label)
								||
								(workItemValue.content && workItemValue.content != element.value.content)
							)
						) {
							dL.push({
								id: element.id,
								value: workItemValue
							});
						}
					}
				});

				// 'Filed Against' Blacklist
				var bL = ["id", "creator", "projectArea", "creationDate", "modified", "modifiedBy", "workItemType"];

				// Remove everything found inside the blacklist
				dL = dL.filter(function (item) {
					return !bL.includes(item.id);
				});

				// Add Attribute to the list, if it doesn't exits already
				dL.forEach(function (element) {

					if (changedAttributes[element.id] == null) {
						changedAttributes[element.id] = {
							attributeId: element.id,
							path: ["attributes", element.id],
							value: element.value
						};
					}

				});

			}

			// List with all the Attribute-IDs which should get ignored, from any origin
			var globalBlackList = ["workflowAction", "internalState", "internalResolution"];

			// Remove all the 
			globalBlackList.forEach(function (value) {
				delete changedAttributes[value];
			});

			var actions = new Set();
			var modifieds = new Set(); //actions that may have been done before last save but could be invalid now
			//add create action
			if (this.creating) {
				actions.add("create/type/" + this.type);
			}

			//if cat changed check the defaults
			if (this.catChanged && this.properties) {

				//makes a map out of the properties object
				this.propMap = this.properties.reduce(function (acc, currVal) {
					return acc.set(currVal.key, currVal.value);
				}, new Map());

				this.properties.forEach(function (entry) {

					if (workitem[entry.key] && workitem[entry.key].label !== entry.value) {
						var translatedKeyValue = this.getTranslatedAttributeToName(entry.key);

						modifieds.add("modify/" + translatedKeyValue);
						actions.add("modify/" + translatedKeyValue);
					}
				});
			}

			//add all other actions
			for (var attribute in changedAttributes) {

				if (!categoryChangeEvent && this.original[attribute] && this.original[attribute].id === workitem[attribute].id) {
					continue;
				}

				if (attribute !== "teamArea" && (!this.propMap || !this.propMap.has(attribute))) {
					actions.add("modify/" + this.getTranslatedAttributeToName(attribute));
				}
			}

			//asks server if modification of selected attributes are allowed
			var validity = JAZZ.isOperationAllowed("com.ibm.team.workitem.operation.workItemSave", taUrl, Array.from(actions));
			validity.then((function (xml) {
				//response contains an overallStatus
				var isError = xml.querySelector("operation-report").getAttribute("jp06:overallStatus") === "ERROR";
				//if that is error find out what exactly is the problem
				if (isError) {
					//creates the hover
					this.displayConflict(xml.querySelectorAll("action"), modifieds);
				} else {
					//no conflict reset everything to just black
					dojoClass.remove(this.roleContainer, "conflict");
					dojoClass.remove(this.roleContainer, "orange");
					for (var i = 0; i < this.eventHandels.length; i++) {
						this.eventHandels[i].remove();
					}
					this.eventHandels = [];
				}
			}).bind(this));

		},

		//gets called if filed against changes
		changeFunc: function (event) {
			this.showRoles(event.value.id, event.workingCopy);//id of cat
			this.catChanged = this.original.category.id !== event.value.id;
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
				url: JAZZ.getApplicationBaseUrl() + "service/com.ibm.team.process.internal.service.web.IProcessWebUIServiceWithChecks/" +
					"teamAreaByUUIDWithLimitedMembersWithChecks?processAreaItemId=" + this.processAreaid + "&maxMembers=20&checkProcessAuthoringLicenses=false",
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

		showRoles: function (categoryId, workingCopy) {
			//get available data
			var user = getAuthenticatedContributor().userId;
			var projectUuid = this.paId;
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

						if (workingCopy.object.attributes.teamArea.id !== this.processAreaid) {
							this.getNameOfProcessArea(workingCopy);
							workingCopy.setValue({
								path: ["attributes", "teamArea", "id"],
								attributeId: "teamArea",
								value: this.processAreaid
							});
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

		},

		//build error message
		displayConflict: function (actions, modifieds) {
			var forbiddenMessage = "";
			var catAndProp = this.catChanged && this.propMap;
			this.illegalActions = [];
			this.modifiedActions = [];
			for (var i = 0; i < actions.length; i++) {
				var curAction = actions[i].attributes["jp06:actionId"].value;
				var isPermittedString = actions[i].attributes["jp06:allowed"].value;
				if (isPermittedString === "false" && curAction.split("/")[0] === "create") { //filters the create/type
					forbiddenMessage = "You're not allowed to create a Work Item of type '" + this.type + "' in this context.<br>" + forbiddenMessage;
				} else if (isPermittedString === "false" && modifieds.has(curAction)) { //Find all the modified attr
					this.modifiedActions.push(curAction.split("/")[1]);
				} else if (isPermittedString === "false" && (!catAndProp || !this.propMap.has(curAction.split("/")[1]))) { //Find all changed and forbidden attributes with no default(e.g. filter out those that are technically not allowed but have been reset to default)
					this.illegalActions.push(curAction.split("/")[1]);
				}
			}
			if (!this.catChanged) {
				forbiddenMessage += "You're not allowed to modify the following in the current Team Area context (you may want to change 'Filed Against'): <br>";
				forbiddenMessage += this.generateUnorderedListFormIllegalAction();

			} else {
				var self = this;
				if (this.modifiedActions.length > 0) {
					forbiddenMessage += "You have changed the 'Filed Against', this means you have to restore defaults on the following attributes to be able to save:<br>";
					this.modifiedActions.forEach(function (attribute) {
						forbiddenMessage += attribute + " => " + self.propMap.get(attribute) + "<br>";
					});
				}
				if (this.illegalActions.length > 0) {
					forbiddenMessage += "<br>You changed the following, which may cause conflicts(this is a prediction and could be wrong):<br>";
					forbiddenMessage += this.generateUnorderedListFormIllegalAction();
				}
			}


			this.createHover(forbiddenMessage);
		},

		generateUnorderedListFormIllegalAction: function () {

			var translatedIllegalActions = "<ul>";
			for (var i = 0; i < this.illegalActions.length; i++) {
				var element = this.illegalActions[i];
				var attributeElement = this.attributeRoleMap.get(this.getTranslatedAttributeForReset(element));

				translatedIllegalActions += "<li>"
				if (attributeElement !== undefined && attributeElement.title !== undefined) {
					translatedIllegalActions += attributeElement.title;
				} else {
					translatedIllegalActions += element;
				}
				translatedIllegalActions += "</li>";

			}
			return translatedIllegalActions + "</ul>";

		},


		findValidExternalLinkConfiguration: function (externalLinkConfig) {
			if (!externalLinkConfig || !Array.isArray(externalLinkConfig)) {
				return null;
			}

			//find first valid external link configuration
			return this.externalLink.find(function (config) {
				return this.isExternalProjectAreaValid(config, this.workingCopy.object.attributes.projectArea.label) && this.isExternalLinkTypeValid(config, this.type);
			}.bind(this)) || null;
		},

		isExternalProjectAreaValid: function (config, projectAreaName) {
			if (!config) {
				return false;
			}

			if (!config.validProjectAreas || config.validProjectAreas.length === 0) {
				return true; //if no valid project areas are defined, all are valid
			}

			if (config.validProjectAreas && config.validProjectAreas.length > 0) {
				return config.validProjectAreas.some(function (validProjectArea) {
					var negativeMatch = validProjectArea.startsWith("!") && validProjectArea.length > 1;

					if (validProjectArea.startsWith("*")) {
						return projectAreaName.toLowerCase().endsWith(validProjectArea.slice(1).toLowerCase()) && !negativeMatch;
					}

					if (validProjectArea.endsWith("*")) {
						return projectAreaName.toLowerCase().startsWith(validProjectArea.slice(0, -1).toLowerCase()) && !negativeMatch;
					}

					if (validProjectArea.startsWith("*") && validProjectArea.endsWith("*")) {
						return projectAreaName.toLowerCase().includes(validProjectArea.slice(1, -1).toLowerCase()) && !negativeMatch;
					}

					return validProjectArea.toLowerCase() === projectAreaName.toLowerCase() && !negativeMatch;
				});
			}

			return false;
		},

		isExternalLinkTypeValid: function (config, type) {
			if (!config) {
				return false;
			}

			if (!config.validTypes || config.validTypes.length === 0) {
				return true; //if no valid types are defined, all are valid
			}

			if (config.validTypes && config.validTypes.length > 0) {
				return config.validTypes.includes(type);
			}

			return false;
		},

		//displays error message
		createHover: function (forbiddenMessage) {
			var changeColor = this.catChanged ? "orange" : "conflict";
			var div = domConstruct.create("div", { innerHTML: forbiddenMessage, 'class': "my-role-presentation" });

			var currentExternalLinkConfig = this.findValidExternalLinkConfiguration(this.externalLink);

			var actionContainerDiv = domConstruct.create("div", { 'class': "my-role-actions-container" });

			var link = domConstruct.create("a", {
				innerHTML: "<img src='../com.siemens.bt.jazz.rtc.workItemEditor.presentation.roles/images/email-icon.png' alt='Email'><span> Send an email to ask for permission</span>",
				onclick: this.startMailSearch.bind(this)
			});

			var externalLink = currentExternalLinkConfig ? domConstruct.create("a", {
				innerHTML: "<img src='" + (currentExternalLinkConfig.icon || "../com.siemens.bt.jazz.rtc.workItemEditor.presentation.roles/images/external-link.svg") + "' alt='External Link'><span> " + currentExternalLinkConfig.description + "</span>",
				onclick: this.openExternalLink.bind(this),
			}) : null;

			var resetLink = domConstruct.create("a", {
				innerHTML: "<img src='" + JAZZ.getApplicationBaseUrl() + "web/com/ibm/team/build/web/graphics/metanav/icons/refresh.gif' class='sprite-image' alt='Reset'><span> Reset conflicting attributes</span>",
				onclick: this.resetConflicts.bind(this),
			});

			var defaultLink = domConstruct.create("a", {
				innerHTML: "<img src='" + JAZZ.getApplicationBaseUrl() + "web/com/ibm/team/build/web/graphics/metanav/icons/refresh.gif' class='sprite-image' alt='Reset'><span> Set conflicting attributes to default</span>",
				onclick: this.resetDefaultValues.bind(this),
				'class': "button reset"
			});

			domConstruct.place(resetLink, actionContainerDiv, "last");
			domConstruct.place(defaultLink, actionContainerDiv, "last");

			if (!currentExternalLinkConfig || (currentExternalLinkConfig && !currentExternalLinkConfig.hideMailto)) {
				domConstruct.place(link, actionContainerDiv, "last");
			}

			if (externalLink) {
				domConstruct.place(externalLink, actionContainerDiv, "last");
			}

			domConstruct.place(actionContainerDiv, div, "last");

			var roleContainer = this.roleContainer;
			dojoClass.add(roleContainer, changeColor);
			var tooltip = new Tooltip({
				content: div
			});
			this.eventHandels.push(on(roleContainer, 'mouseover', function () {
				popUp.open({
					popup: tooltip,
					around: roleContainer,
					onCancel: function () {
						popUp.close(tooltip);
					}
				});
			}));
			on(roleContainer.ownerDocument, 'click', function () {
				popUp.close(tooltip);
			});
		},

		getNameOfProcessArea: function (workingCopy) {
			var processAreaType = "teamArea";
			if (this.processAreaid === this.paId) {
				processAreaType = "projectArea";
			}
			var url = JAZZ.getApplicationBaseUrl() + "rpt/repository/foundation?fields=" + processAreaType + "/" + processAreaType + "[itemId=" + this.processAreaid + "]/(name)";
			XHR.oslcXmlGetRequest(url).then(function (Result) {

				var name = Result.querySelector("name").innerHTML;

				workingCopy.setValue({
					path: ["attributes", "teamArea", "label"],
					attributeId: "teamArea",
					value: name
				})


			});
		},

		getTranslatedAttributeToName: function (attribute) {
			var usingValue = (WORK_ITEM_ATTRIBUTES.BUILT_IN.includes(attribute) ? WORK_ITEM_ATTRIBUTES.getExternalId(attribute).split(".").pop() : attribute);
			return attribute.toLowerCase() == usingValue.toLowerCase() ? attribute : usingValue;
		},

		getTranslatedAttributeForReset: function (attribute) {
			var valueToTranslate = IBM_WORK_ITEM_ATTRIBUTE_PREFIX + attribute;
			var translatedAttribute = WORK_ITEM_ATTRIBUTES.getInternalId(valueToTranslate);
			return translatedAttribute != valueToTranslate ? translatedAttribute : attribute;
		},

		//reset the changed and conflicting attributes (reset as refresh would, not default)
		resetConflicts: function () {
			var self = this;

			this.illegalActions.forEach(function (attribute) {

				var useAttribute = self.getTranslatedAttributeForReset(attribute);
				var originalAttributeValue = self.original[useAttribute];

				// If the ID isn't set, it needs to be set to null.
				// This is required for every value which is 'Unassigned'
				// This is required by Jazz !!!!!
				if (originalAttributeValue && !originalAttributeValue.id) {
					originalAttributeValue.id = null;
				}

				self.workingCopy.setValue({
					path: ["attributes", useAttribute],
					attributeId: useAttribute,
					value: self.original[useAttribute]
				});

			});
		},

		//reset the changed and conflicting attributes to the default value
		resetDefaultValues: function () {
			var self = this;

			this.illegalActions.forEach(function (attribute) {

				var useAttribute = self.getTranslatedAttributeForReset(attribute);
				var foundDefaultValue = self.getDefaultAttributeValue(useAttribute);

				// If the ID isn't set, it needs to be set to null.
				// This is required for every value which is 'Unassigned'
				// This is required by Jazz !!!!!
				if (foundDefaultValue && !foundDefaultValue.id) {
					foundDefaultValue.id = null;
				}

				// Jazz needs the to have a Label for some reason . . .
				// Coincidentally, the value of the label is the same as the value assigned to the name.
				if (foundDefaultValue && foundDefaultValue.label == undefined) {
					foundDefaultValue.label = (foundDefaultValue.name != undefined ? foundDefaultValue.name : "");
				}

				self.workingCopy.setValue({
					path: ["attributes", useAttribute],
					attributeId: useAttribute,
					value: foundDefaultValue
				});

			});

		},

		openExternalLink: function () {
			var currentExternalLinkConfig = this.findValidExternalLinkConfiguration(this.externalLink);

			if (!currentExternalLinkConfig) {
				return; //no valid config found, do nothing
			}

			if (currentExternalLinkConfig && currentExternalLinkConfig.url) {
				var externalLinkHref = currentExternalLinkConfig.url;
				try {
					externalLinkHref = externalLinkHref.replaceAll("{processAreaId}", this.processAreaid);
					externalLinkHref = externalLinkHref.replaceAll("{workItemId}", this.workingCopy.object.id);
					externalLinkHref = externalLinkHref.replaceAll("{projectAreaId}", this.workingCopy.object.attributes.projectArea.id);
					externalLinkHref = externalLinkHref.replaceAll("{teamAreaId}", this.workingCopy.object.attributes.teamArea ? this.workingCopy.object.attributes.teamArea.id : this.workingCopy.object.attributes.projectArea.id);

					window.open(externalLinkHref, "_blank");
				} catch (error) {
					console.error("Error replacing placeholders in external link URL: ", error);
					return;
				}
			}
		},

		startMailSearch: function () {
			var currentProcessAreaId = this.processAreaid;
			this.searchForMail(currentProcessAreaId);
		},

		searchForMail: function (currentProcessAreaId) {
			var isPA = currentProcessAreaId === this.paId;

			var url = JAZZ.getApplicationBaseUrl() +
				"service/com.ibm.team.process.internal.service.web.IProcessWebUIServiceWithChecks/" +
				(isPA ? "project" : "team") +
				"AreaByUUIDWithLimitedMembersWithChecks?maxMembers=2000&checkProcessAuthoringLicenses=false&processAreaItemId=" +
				currentProcessAreaId;

			XHR.oslcXmlGetRequest(url).then((function (result) {
				var mails = [];
				result.querySelectorAll("processRoles").forEach(function (processRole) {
					if (processRole.querySelector("id").innerHTML === "JazzCM") {
						var foundMail = processRole.parentElement.querySelector("emailAddress").innerHTML;
						if (foundMail && !mails.includes(foundMail)) {
							mails.push(foundMail);
						}
					}
				});
				if (mails.length <= 0) {
					if (isPA) {
						alert("Could not find anyone responsible, sorry")
					} else {
						var self = this;
						result.querySelectorAll("children").forEach(function (ta) {
							if (ta.querySelector("itemId").innerHTML === currentProcessAreaId) {
								self.searchForMail(ta.parentElement.querySelector("itemId").innerHTML);
							}
						})
					}

				} else {
					this.sendMail(mails);
				}
			}).bind(this));
		},

		sendMail: function (mails) {
			var to = mails.join(";");
			var body = "Hello\n" +
				"\n" +
				"I would like to modify a Work Item in '" + this.workitem.teamArea.label + "' , but I lack the necessary permissions to do so.\n" +
				"Could you assign me an additional role?\n" +
				"\n" +
				"Many thanks and kind regards\n"
				+ com.ibm.team.repository.web.client.session.getAuthenticatedContributor().name;
			var href = encodeURI("mailto:" + to + "?subject=Request for additional Permissions&body=") + encodeURIComponent(body);
			//open mailto whiteout the "do you really want to leave' notification
			var temp = window.onbeforeunload;
			window.onbeforeunload = function () {
				window.onbeforeunload = temp; //sets onbeforeunload back after email opened
			};
			window.open(href, '_top');
		},


	});
})
	;
