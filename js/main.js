/*global define,document */
/*jslint sloppy:true,nomen:true */
/*
 | Copyright 2014 Esri
 |
 | Licensed under the Apache License, Version 2.0 (the "License");
 | you may not use this file except in compliance with the License.
 | You may obtain a copy of the License at
 |
 |    http://www.apache.org/licenses/LICENSE-2.0
 |
 | Unless required by applicable law or agreed to in writing, software
 | distributed under the License is distributed on an "AS IS" BASIS,
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 | See the License for the specific language governing permissions and
 | limitations under the License.
 */
define([
  "dojo/_base/declare",
  "dojo/window",
  "dojo/_base/array",
  "dojo/_base/Color",
  "dojo/promise/all",
  "dojo/Deferred",
  "dojo/_base/lang",
  "dojo/_base/kernel",
  "esri/domUtils",
  "esri/request",
  "esri/lang",
  "esri/arcgis/utils",
  "dojo/query",
  "dojo/dom",
  "dijit/registry",
  "dojo/dom-class",
  "dojo/dom-style",
  "dojo/dom-geometry",
  "dojo/dom-construct",
  "dojo/on",
  "esri/layers/FeatureLayer",
  "esri/graphic",
  "application/MapUrlParams",
  "dojo/domReady!"
], function (
  declare,
  win,
  array,
  Color,
  all,
  Deferred,
  lang, kernel,
  domUtils,
  esriRequest,
  esriLang,
  arcgisUtils,
  query,
  dom,
  registry,
  domClass,
  domStyle,
  domGeometry,
  domConstruct,
  on,
  FeatureLayer,
  Graphic,
  MapUrlParams
) {
  return declare(null, {
    config: {},
    ovmap: null,
    map: null,
    editor: null,
    tableHandler: null,
    extentHandler: null,
    table: null,
    legend: null,
    //tableSelectionHandler: null,
    timeFormats: ["shortDateShortTime", "shortDateLEShortTime", "shortDateShortTime24", "shortDateLEShortTime24", "shortDateLongTime", "shortDateLELongTime", "shortDateLongTime24", "shortDateLELongTime24"],
    startup: function (config) {
      // Set lang attribute to current locale
      document.documentElement.lang = kernel.locale;
      // config will contain application and user defined info for the template such as i18n strings, the web map id
      // and application id
      // any url parameters and any application specific configuration information.
      if (config) {
        this.config = config;
        window.config = config;
        if (this.config.sharedThemeConfig && this.config.sharedThemeConfig.attributes && this.config.sharedThemeConfig.attributes.theme) {
          var sharedTheme = this.config.sharedThemeConfig.attributes;
          if (sharedTheme.layout && sharedTheme.layout.header && sharedTheme.layout.header.component && sharedTheme.layout.header.component.settings && sharedTheme.layout.header.component.settings.logoUrl) {
            this.config.logoimage = sharedTheme.layout.header.component.settings.logoUrl;
            this.config.logointitle = true;
          } else if (sharedTheme.theme && sharedTheme.theme.logo && sharedTheme.theme.logo.small) {
            this.config.logoimage = sharedTheme.theme.logo.small;
          }
          this.config.color = sharedTheme.theme.text.color;
          this.config.theme = sharedTheme.theme.body.bg;
          this.config.titlecolor = sharedTheme.theme.brand.primary;
        }

        if (this.config.customLayout === "fullmap") {
          domClass.add(dom.byId("header"), "bg");
          // if the background and title color are the defaults then set to white
          if (this.config.theme === "#545454" && this.config.titlecolor === "#333") {
            this.config.titlecolor = "#fff";
          }
          domStyle.set(dom.byId("header"), {
            color: this.config.titlecolor
          });
        } else {
          //default layout let's use header bg color for title instead. 
          this.config.titlecolor = this.config.theme;
        }
        var customTheme = document.createElement("link");
        customTheme.setAttribute("rel", "stylesheet");
        customTheme.setAttribute("type", "text/css");
        customTheme.setAttribute("href", "css/theme/" + this.config.customLayout + ".css");
        document.head.appendChild(customTheme);


        // Create and add custom style sheet
        if (this.config.customstyle) {
          var style = document.createElement("style");
          style.appendChild(document.createTextNode(this.config.customstyle));
          document.head.appendChild(style);
        }
        //supply either the webmap id or, if available, the item info
        var itemInfo = this.config.itemInfo || this.config.webmap;

        var mapParams = new MapUrlParams({
          center: this.config.center || null,
          extent: this.config.extent || null,
          level: this.config.level || null,
          marker: this.config.marker || null,
          mapSpatialReference: itemInfo.itemData.spatialReference,
          defaultMarkerSymbol: this.config.markerSymbol,
          defaultMarkerSymbolWidth: this.config.markerSymbolWidth,
          defaultMarkerSymbolHeight: this.config.markerSymbolHeight,
          geometryService: this.config.helperServices.geometry.url
        });

        mapParams.processUrlParams().then(lang.hitch(this, function (urlParams) {
          this._createWebMap(itemInfo, urlParams);
          //update app theme
          query(".bg").style("backgroundColor", this.config.theme.toString());
          query("#titleDiv").style("color", this.config.titlecolor.toString());
        }), lang.hitch(this, function (error) {
          this.reportError(error);
        }));
      } else {
        var error = new Error("Main:: Config is not defined");
        this.reportError(error);
      }
    },
    loadMapWidgets: function () { /*Add all the widgets that live on the map*/
      require(["application/sniff!scale?esri/dijit/Scalebar"], lang.hitch(this, function (Scalebar) {
        if (!Scalebar) {
          return;
        }
        var scalebar = new Scalebar({
          map: this.map,
          scalebarUnit: this.config.units
        });
      }));

      if (this.config.zoom) {
        //setup icon fonts
        query(".esriSimpleSliderIncrementButton").forEach(function (node) {
          domClass.add(node, "icon-zoomin");
        });
        query(".esriSimpleSliderDecrementButton").forEach(function (node) {
          domClass.add(node, "icon-zoomout");
        });

        query(".esriSimpleSlider").style("color", this.config.iconcolortheme.toString());
        query(".esriSimpleSlider").style("background-color", this.config.theme.toString());
        query(".esriSimpleSlider").style("background", this.config.theme.toString());
      }
      //add classes to manage positioning locate, zoom,  home buttons
      if (this.config.zoom === false || this.config.zoom_position !== "top-left") {
        domClass.add(document.body, "no-zoom");
      }
      if (this.config.home === false) {
        domClass.add(document.body, "no-home");
      }
      if (this.config.locate === false) {
        domClass.add(document.body, "no-locate");
      }
      //Zoom slider needs to be visible to add home
      if (this.config.home && this.config.zoom) {
        require(["application/sniff!home?esri/dijit/HomeButton"], lang.hitch(this, function (HomeButton) {
          if (!HomeButton) {
            return;
          }
          var home = new HomeButton({
            map: this.map
          }, domConstruct.create("div", {}, query(".esriSimpleSliderIncrementButton")[0], "after"));
          //Use the home icon from the esri Fonts
          query(".HomeButton .home").forEach(function (node) {
            domClass.add(node, "icon-home");
            domClass.add(node, "icon-color");
          });
          home.startup();
          this._updateTheme();
        }));
      }
      require(["application/sniff!search?esri/dijit/Search", "application/sniff!search?esri/tasks/locator", "application/sniff!search?application/SearchSources"], lang.hitch(this, function (Search, Locator, SearchSources) {
        if (!Search && !Locator && !SearchSources) {
          return;
        }
        var searchOptions = {
          map: this.map,
          useMapExtent: this.config.searchExtent,
          itemData: this.config.response.itemInfo.itemData
        };

        if (this.config.searchConfig) {
          searchOptions.applicationConfiguredSources = this.config.searchConfig.sources || [];
        } else if (this.config.searchLayers) {
          var configuredSearchLayers = (this.config.searchLayers instanceof Array) ? this.config.searchLayers : JSON.parse(this.config.searchLayers);
          searchOptions.configuredSearchLayers = configuredSearchLayers;
          searchOptions.geocoders = this.config.locationSearch ? this.config.helperServices.geocode : [];
        }
        var searchSources = new SearchSources(searchOptions);
        var createdOptions = searchSources.createOptions();
        createdOptions.enableButtonMode = true;
        if (this.config.searchConfig && this.config.searchConfig.activeSourceIndex) {
          createdOptions.activeSourceIndex = this.config.searchConfig.activeSourceIndex;
        }
        var search = new Search(createdOptions, domConstruct.create("div", {
          id: "search"
        }, "mapDiv"));

        search.startup();
        query(".arcgisSearch .searchBtn").style("backgroundColor", this.config.theme.toString());
        query(".arcgisSearch .esriIconSearch").style("color", this.config.iconcolortheme.toString());

        query(".searchIcon").style("color", this.config.iconcolortheme.toString());
      }));
      //Feature Search or find (if no search widget)
      if ((this.config.find || (this.config.customUrlLayer.id !== null && this.config.customUrlLayer.fields.length > 0 && this.config.customUrlParam !== null))) {
        require(["esri/dijit/Search", "esri/urlUtils"], lang.hitch(this, function (Search, urlUtils) {
          var source = null,
            value = null,
            searchLayer = null;

          var urlObject = urlUtils.urlToObject(document.location.href);
          urlObject.query = urlObject.query || {};
          urlObject.query = esriLang.stripTags(urlObject.query);
          var customUrl = null;
          for (var prop in urlObject.query) {
            if (urlObject.query.hasOwnProperty(prop)) {
              if (prop.toUpperCase() === this.config.customUrlParam.toUpperCase()) {
                customUrl = prop;
              }
            }
          }

          //Support find or custom url param
          if (this.config.find) {
            value = decodeURIComponent(this.config.find);
          } else if (customUrl) {

            value = urlObject.query[customUrl];

            searchLayer = this.map.getLayer(this.config.customUrlLayer.id);
            if (searchLayer) {

              var searchFields = this.config.customUrlLayer.fields[0].fields;
              source = {
                exactMatch: true,
                outFields: ["*"],
                featureLayer: searchLayer,
                displayField: searchFields[0],
                searchFields: searchFields
              };
            }
          }
          var urlSearch = new Search({
            map: this.map
          });

          if (source) {
            urlSearch.set("sources", [source]);
          }
          urlSearch.on("load", lang.hitch(this, function () {
            urlSearch.search(value);
          }));

          urlSearch.startup();

        }));
      }

      require(["application/sniff!locate?esri/dijit/LocateButton"], lang.hitch(this, function (LocateButton) {
        if (!LocateButton) {
          domClass.add(document.body, "no-locate");
          return;
        }
        var locate = new LocateButton({
          map: this.map
        }, domConstruct.create("div", {}, "mapDiv"));
        query(".LocateButton .zoomLocateButton").forEach(function (node) {
          domClass.add(node, "icon-locate");
          domClass.add(node, "icon-color");
        });
        locate.startup();
        query(".LocateButton .zoomLocateButton").style("background-color", this.config.theme.toString());

      }));
    },
    _addToolbarWidgets: function () {

      var shareDef = new Deferred(),
        basemapDef = new Deferred(),
        layerDef = new Deferred(),
        tableDef = new Deferred(),
        printDef = new Deferred(),
        measureDef = new Deferred(),
        bookmarksDef = new Deferred();
      var toolDeferreds = [measureDef, shareDef, tableDef, printDef, layerDef, basemapDef, bookmarksDef];

      /*Toolbar widgets ( print, layers, share, basemap etc)*/

      require(["application/sniff!table?esri/dijit/FeatureTable", "application/sniff!table?esri/tasks/query"], lang.hitch(this, function (FeatureTable, esriQuery) {

        if (!FeatureTable) {
          tableDef.resolve(null);
          return;
        }
        this.tableHandler = null;
        //this.tableSelectionHandler = null;
        // Create the table if a layer and field have been
        // defined or if there's a feature layer in the map
        var layer = null;

        if (this.config.tableLayer && this.config.tableLayer.id) {
          layer = this.map.getLayer(this.config.tableLayer.id);

          if (layer) {
            //get hidden fields
            var hiddenFields = null;
            if (this.config.tableLayer.fields) {
              if (this.config.tableLayer.fields.length && this.config.tableLayer.fields.length > 0) {
                hiddenFields = this.config.tableLayer.fields[0].fields;
              }
            }
          } else {
            layer = null;
          }
        }

        if (layer === null) {
          // Get first feature layer from map if no feature layers then return
          array.some(this.map.graphicsLayerIds, lang.hitch(this, function (id) {
            var l = this.map.getLayer(id);
            if (l && l.type === "Feature Layer" && l.supportsAdvancedQueries === true) {
              layer = l;
              return true;
            }
          }));
        }
        //if no layer don't create table
        if (layer === null) {
          console.log("Configure the app to select a layer that supports Advanced Queries for the Table");
          tableDef.resolve(null);
          return;
        }

        var btn = this._createToolbarButton("table_toggle", "icon-table", this.config.i18n.tools.tableTool);

        on(btn, "click", lang.hitch(this, function () {
          this._closeContainers("tableDiv");

          //Toggle table display
          var table = dom.byId("tableDiv");
          var height = domStyle.get(table, "height");
          if (height === 0) { //show table
            domClass.add(btn, "tool-selected");
            this._openTable(table);
          } else { //hide table
            domClass.remove(btn, "tool-selected");
            this._closeTable(table, layer);
          }
          this.map.graphics.clear();
          registry.byId("featureTable").selectRows([]);
          this._updateView();
        }));
        this.table = new FeatureTable({
          id: "featureTable",
          featureLayer: layer,
          showDataTypes: false,
          syncSelection: true,
          // zoomToSelection: true,
          showRelatedRecords: true,
          readOnly: !this.config.editable,
          editable: this.config.editable,
          hiddenFields: hiddenFields,
          showAttachments: true,
          map: this.map
        }, "featureTable");


        this.tableHandler = on.pausable(layer, "click", lang.hitch(this, function (evt) {
          var idProperty = layer.objectIdField;
          var feature, featureId, query;

          if (evt.graphic && evt.graphic.attributes && evt.graphic.attributes[idProperty]) {
            feature = evt.graphic,
              featureId = feature.attributes[idProperty];

            query = new esriQuery();
            query.returnGeometry = false;
            query.objectIds = [featureId];
            query.where = "1=1";

            layer.selectFeatures(query, FeatureLayer.SELECTION_NEW);

          }
        }));
        this.tableHandler.pause();

        this.table.startup();

        tableDef.resolve(btn);
        return tableDef.promise;
      }));

      require(["application/sniff!print?esri/dijit/Print", "application/sniff!print?esri/tasks/PrintTemplate", "application/sniff!print?dojo/i18n!esri/nls/jsapi"], lang.hitch(this, function (Print, PrintTemplate, esriBundle) {

        if (!Print) {
          printDef.resolve(null);
          return;
        }
        var print = null;
        var btn = this._createToolbarButton("print_toggle", "icon-printer", this.config.i18n.tools.printTool);

        // Add a loading indicator to the Printing label
        esriBundle.widgets.print.NLS_printing = esriBundle.widgets.print.NLS_printing + "<img class='loadPrint' src='./images/loading-small.png'/>";

        on(btn, "click", lang.hitch(this, function () {
          this._displayContainer("print_container", "print_toggle");
        }));

        this._createContainer("print_container", "printDiv");

        var layoutOptions = {
          "titleText": this.config.title,
          "scalebarUnit": this.config.units,
          "legendLayers": []
        };

        //add text box for title to print dialog
        var titleNode = domConstruct.create("input", {
          id: "print_title",
          className: "printTitle",
          placeholder: this.config.i18n.tools.printTitlePrompt
        }, domConstruct.create("div"));

        domConstruct.place(titleNode, "printDiv");

        this.config.printformat = this.config.printformat.toLowerCase();
        if (this.config.printlegend) {

          var legendNode = domConstruct.create("input", {
            id: "legend_ck",
            className: "checkbox legendnode",
            type: "checkbox",
            checked: false
          }, domConstruct.create("div", {
            "class": "checkbox"
          }));


          var labelNode = domConstruct.create("label", {
            "for": "legend_ck",
            "className": "checkbox labelnode",
            "innerHTML": "  " + this.config.i18n.tools.printLegend
          }, domConstruct.create("div"));
          domConstruct.place(legendNode, dom.byId("printDiv"));
          domConstruct.place(labelNode, dom.byId("printDiv"));

          on(legendNode, "change", lang.hitch(this, function (arg) {

            if (legendNode.checked) {
              var layers = arcgisUtils.getLegendLayers(this.config.response);
              var legendLayers = array.map(layers, function (layer) {
                return {
                  "layerId": layer.layer.id
                };
              });
              if (legendLayers.length > 0) {
                layoutOptions.legendLayers = legendLayers;
              }
              array.forEach(print.templates, function (template) {
                template.layoutOptions = layoutOptions;
              });

            } else {
              array.forEach(print.templates, function (template) {
                if (template.layoutOptions && template.layoutOptions.legendLayers) {
                  template.layoutOptions.legendLayers = [];
                }
              });
            }

          }));

          this._updateTheme();
        } else {
          domStyle.set("printDiv", "height", "80px");
        }
        // if org has print templates defined use those.
        if (this.config.helperServices.printTask && this.config.helperServices.printTask.templates && this.config.helperServices.printTask.templates.length && this.config.helperServices.printTask.templates.length > 0) {
          this.config.printlayouts = false;
        }
        if (this.config.printlayouts) {
          esriRequest({
            url: this.config.helperServices.printTask.url,
            content: {
              "f": "json"
            },
            "callbackParamName": "callback"
          }).then(lang.hitch(this, function (response) {
            var layoutTemplate,
              templateNames,
              mapOnlyIndex,
              templates;

            layoutTemplate = array.filter(response.parameters, function (param, idx) {
              return param.name === "Layout_Template";
            });

            if (layoutTemplate.length === 0) {
              console.log("print service parameters name for templates must be \"Layout_Template\"");
              return;
            }
            templateNames = layoutTemplate[0].choiceList;


            // remove the MAP_ONLY template then add it to the end of the list of templates
            mapOnlyIndex = array.indexOf(templateNames, "MAP_ONLY");
            if (mapOnlyIndex > -1) {
              var mapOnly = templateNames.splice(mapOnlyIndex, mapOnlyIndex + 1)[0];
              templateNames.push(mapOnly);
            }

            // create a print template for each choice
            templates = array.map(templateNames, lang.hitch(this, function (name) {
              var plate = new PrintTemplate();
              plate.layout = plate.label = name;
              plate.format = this.config.printformat;

              plate.layoutOptions = layoutOptions;
              return plate;
            }));


            print = new Print({
              map: this.map,
              templates: templates,
              url: this.config.helperServices.printTask.url
            }, domConstruct.create("div"));

            print.on("print-start", lang.hitch(this, function () {
              var printBox = dom.byId("print_title");
              if (printBox.value) {
                array.forEach(print.templates, lang.hitch(this, function (template) {
                  template.layoutOptions.titleText = printBox.value;
                }));
              }
            }));

            domConstruct.place(print.printDomNode, dom.byId("printDiv"), "first");


            print.startup();


          }));
        } else { //use the default layouts  or org layouts

          var templates = null;
          if (this.config.helperServices.printTask && this.config.helperServices.printTask.templates) {
            templates = this.config.helperServices.printTask.templates;
          } else {
            templates = [{
                layout: "Letter ANSI A Landscape",
                layoutOptions: layoutOptions,
                label: this.config.i18n.tools.printLayouts.label1 + " ( " + this.config.printformat + " )",
                format: this.config.printformat
              },
              {
                layout: "Letter ANSI A Portrait",
                layoutOptions: layoutOptions,
                label: this.config.i18n.tools.printLayouts.label2 + " ( " + this.config.printformat + " )",
                format: this.config.printformat
              },
              {
                layout: "Letter ANSI A Landscape",
                layoutOptions: layoutOptions,
                label: this.config.i18n.tools.printLayouts.label3 + " ( image )",
                format: "PNG32"
              },
              {
                layout: "Letter ANSI A Portrait",
                layoutOptions: layoutOptions,
                label: this.config.i18n.tools.printLayouts.label4 + " ( image )",
                format: "PNG32"
              }
            ];
          }
          array.forEach(templates, lang.hitch(this, function (template) {
            if (template.layout === "MAP_ONLY") {
              template.exportOptions = {
                width: 670,
                height: 500,
                dpi: 96
              };
            }
          }));
          print = new Print({
            map: this.map,
            id: "printButton",
            templates: templates,
            url: this.config.helperServices.printTask.url
          }, domConstruct.create("div"));

          print.on("print-start", lang.hitch(this, function () {
            var printBox = dom.byId("print_title");
            if (printBox.value) {
              array.forEach(print.templates, lang.hitch(this, function (template) {
                template.layoutOptions.titleText = printBox.value;
              }));
            }
          }));

          domConstruct.place(print.printDomNode, dom.byId("printDiv"), "first");
          print.startup();

        }

        printDef.resolve(btn);
        return printDef.promise;
      }));
      require(["application/sniff!measure?esri/dijit/Measurement"], lang.hitch(this, function (Measurement) {
        if (!Measurement) {
          measureDef.resolve(null);
          return;
        }


        var btn = this._createToolbarButton("measure_toggle", "icon-measure", this.config.i18n.tools.measureTool);

        on(btn, "click", lang.hitch(this, function () {
          this._displayContainer("measure_container", "measure_toggle");
          var measureDisp = domStyle.get("measure_container", "display");
          if (measureDisp && measureWidget && measureDisp === "none") {
            var tool = measureWidget.getTool();
            if (tool && tool.toolName) {
              measureWidget.setTool(tool.toolName, false);
              measureWidget.clearResult();
              //reactivate map click
              this.map.setInfoWindowOnClick(true);
            }
          }
        }));

        this._createContainer("measure_container", "measureDiv");
        var areaUnit = (this.config.units === "metric") ? "esriSquareKilometers" : "esriSquareMiles";
        var lengthUnit = (this.config.units === "metric") ? "esriKilometers" : "esriMiles";
        var options = {
          map: this.map,
          defaultAreaUnit: areaUnit,
          defaultLengthUnit: lengthUnit
        };
        var measureWidget = new Measurement(options, dom.byId("measureDiv"));

        measureWidget.startup();
        query(".tools-menu").on("click", lang.hitch(this, function (e) {
          if (e.target && e.target.parentNode && e.target.parentNode.id && e.target.parentNode.id !== "measure_toggle") {
            var tool = measureWidget.getTool();
            if (tool) {
              measureWidget.setTool(tool.toolName, false);
              measureWidget.clearResult();
              //reactivate map click
              this.map.setInfoWindowOnClick(true);
            }
          }
        }));
        query(".esriMeasurement .dijitButtonNode").on("click", lang.hitch(this, function (e) {
          var tool = measureWidget.getTool();

          if (tool) {
            this.map.setInfoWindowOnClick(false);
          } else {
            this.map.setInfoWindowOnClick(true);
          }
        }));
        measureDef.resolve(btn);
        return measureDef.promise;

      }));
      require(["application/sniff!basemaps?esri/dijit/BasemapGallery"], lang.hitch(this, function (BasemapGallery) {
        if (!BasemapGallery) {
          basemapDef.resolve(null);
          return;
        }
        var galleryOptions = {
          showArcGISBasemaps: true,
          portalUrl: this.config.sharinghost,
          bingMapsKey: this.config.orgInfo.bingKey || "",
          basemapsGroup: this._getBasemapGroup(),
          map: this.map
        };

        var btn = this._createToolbarButton("basemap_toggle", "icon-basemap", this.config.i18n.tools.basemapTool);

        on(btn, "click", lang.hitch(this, function () {
          this._displayContainer("basemap_container", "basemap_toggle");
        }));

        this._createContainer("basemap_container", "galleryDiv");

        var gallery = new BasemapGallery(galleryOptions, dom.byId("galleryDiv"));


        gallery.startup();
        basemapDef.resolve(btn);
        return basemapDef.promise;

      }));
      require(["application/sniff!bookmarks?esri/dijit/Bookmarks"], lang.hitch(this, function (Bookmarks) {
        var webmapBookmarks = this.config.response.itemInfo.itemData.bookmarks || null;
        if (!Bookmarks || !webmapBookmarks) {
          bookmarksDef.resolve(null);
          return;
        }

        var btn = this._createToolbarButton("bookmark_toggle", "icon-book", this.config.i18n.tools.bookmarkTool);

        on(btn, "click", lang.hitch(this, function () {
          this._displayContainer("bookmark_container", "bookmark_toggle");
        }));

        this._createContainer("bookmark_container", "bookmarkDiv");

        var bookmarkWidget = new Bookmarks({
          map: this.map,
          bookmarks: webmapBookmarks
        }, domConstruct.create("div", {}, "bookmarkDiv"));

        bookmarksDef.resolve(btn);
        return bookmarksDef.promise;

      }));
      require(["application/sniff!layerlist?esri/dijit/LayerList"], lang.hitch(this, function (LayerList) {

        if (!LayerList) {
          layerDef.resolve(null);
          return;
        }

        var layers = arcgisUtils.getLayerList(this.config.response);
        if (layers && layers.length && layers.length === 0) {
          console.log("No Map Layers");
          return;
        }

        var btn = this._createToolbarButton("layer_toggle", "icon-layers", this.config.i18n.tools.layerTool);

        on(btn, "click", lang.hitch(this, function () {
          this._displayContainer("layer_container", "layer_toggle");
        }));
        this._createContainer("layer_container", "layerDiv");


        var toc = new LayerList({
          map: this.map,
          layers: layers,
          showSubLayers: this.config.includesublayers,
          //subLayers: this.config.includesublayers,
          showLegend: this.config.includelayerlegend,
          showOpacitySlider: this.config.includelayeropacity
        }, domConstruct.create("div", {}, "layerDiv"));
        toc.startup();
        if (this.legend) {
          on(toc, "toggle", lang.hitch(this, function () {
            this.legend.refresh();
          }));
        }
        layerDef.resolve(btn);
        return layerDef.promise;
      }));

      require(["application/sniff!share?application/ShareDialog"], lang.hitch(this, function (ShareDialog) {

        if (!ShareDialog) {
          shareDef.resolve(null);
          return;
        }

        this._createContainer("share_container", "shareDiv");

        var shareDialog = new ShareDialog({
          bitlyLogin: this.config.bitlyLogin,
          bitlyKey: this.config.bitlyKey,
          map: this.map,
          embedVisible: this.config.share_embed,
          image: this.config.sharinghost + "/sharing/rest/content/items/" + this.config.response.itemInfo.item.id + "/info/" + this.config.response.itemInfo.thumbnail,
          title: this.config.title,
          summary: this.config.response.itemInfo.item.snippet || ""
        }, "shareDiv");

        shareDialog.startup();

        var btn = this._createToolbarButton("share_toggle", "icon-share", this.config.i18n.tools.shareTool);

        on(btn, "click", lang.hitch(this, function () {
          this._displayContainer("share_container", "share_toggle");
          shareDialog.updateUrl();

          var displayMode = domStyle.get("share_container", "display");
          if (displayMode === "block") {
            if (!this.extentHandler) {
              this.extentHandler = on.pausable(this.map, "extent-change", lang.hitch(this, function () {
                if (shareDialog.useExtent) {
                  shareDialog.updateUrl();
                }
              }));
            } else {
              this.extentHandler.resume();
            }
          } else {
            if (this.extentHandler) {
              this.extentHandler.pause();
            }
          }
        }));

        shareDef.resolve(btn);
        return shareDef.promise;
      }));

      //Wait until all the tools have been created then position on the toolbar
      //otherwise we'd get the tools placed in a random order
      all(toolDeferreds).then(lang.hitch(this, function (results) {
        array.forEach(results, lang.hitch(this, function (node) {
          if (node) {
            domConstruct.place(node, "toolbar-menu");
          }
        }));
        this._updateTheme();
      }));

    },

    _getBasemapGroup: function () {
      //Get the id or owner and title for an organizations custom basemap group.
      var basemapGroup = null;
      if (this.config.basemapgroup && this.config.basemapgroup.title && this.config.basemapgroup.owner) {
        basemapGroup = {
          "owner": this.config.basemapgroup.owner,
          "title": this.config.basemapgroup.title
        };
      } else if (this.config.basemapgroup && this.config.basemapgroup.id) {
        basemapGroup = {
          "id": this.config.basemapgroup.id
        };
      }
      return basemapGroup;
    },
    reportError: function (error) {
      // remove loading class from body
      domClass.remove(document.body, "app-loading");
      domClass.add(document.body, "app-error");
      // an error occurred - notify the user. In this example we pull the string from the
      // resource.js file located in the nls folder because we've set the application up
      // for localization. If you don't need to support multiple languages you can hardcode the
      // strings here and comment out the call in index.html to get the localization strings.
      // set message
      var node = dom.byId("loading_message");
      if (node) {
        if (this.config && this.config.i18n) {
          node.innerHTML = this.config.i18n.map.error + ": " + error.message;
        } else {
          node.innerHTML = "Unable to create map: " + error.message;
        }
      }
    },
    // create a map based on the input web map id
    _createWebMap: function (itemInfo, params) {
      params.mapOptions.slider = this.config.zoom;
      params.mapOptions.sliderPosition = this.config.zoom_position;
      params.mapOptions.logo = (this.config.logoimage === null || this.config.logointitle === true) ? true : false;
      var isEditable = false;
      if (this.config.editable || this.config.editor) {
        isEditable = true;
      }
      arcgisUtils.createMap(itemInfo, "mapDiv", {
        mapOptions: params.mapOptions,
        usePopupManager: true,
        layerMixins: this.config.layerMixins || [],
        editable: isEditable,
        bingMapsKey: this.config.orgInfo.bingKey || ""
      }).then(lang.hitch(this, function (response) {
        this.map = response.map;
        this.config.response = response;
        if (params.markerGraphic) {
          // Add a marker graphic with an optional info window if
          // one was specified via the marker url parameter
          require(["esri/layers/GraphicsLayer"], lang.hitch(this, function (GraphicsLayer) {
            var markerLayer = new GraphicsLayer();

            this.map.addLayer(markerLayer);
            markerLayer.add(params.markerGraphic);

            if (params.markerGraphic.infoTemplate) {
              this.map.infoWindow.setFeatures([params.markerGraphic]);
              this.map.infoWindow.show(params.markerGraphic.geometry);
            }
          }));

        }
        if (this.config.logoimage) {
          var logoNode = null;

          if (this.config.logointitle === true && this.config.showtitle) {
            //add logo to title
            logoNode = domConstruct.create("div", {
              id: "title-logo"
            });
            domConstruct.place(logoNode, dom.byId("header"), "first");
            //resize logo if font-size is resized.
            if (this.config.titlefontsize) {
              domStyle.set(logoNode, "width", this.config.titlefontsize);
              domStyle.set(logoNode, "height", this.config.titlefontsize);
              domStyle.set(logoNode, "line-height", this.config.titlefontsize);
            }
          } else {
            //add logo to map
            query(".esriControlsBR").forEach(lang.hitch(this, function (node) {
              logoNode = node;
            }));
          }
          var link = null;
          if (this.config.logolink) {
            link = domConstruct.create("a", {
              href: this.config.logolink,
              target: "_blank"
            }, logoNode);
          }

          domConstruct.create("img", {
            width: "65px",
            height: "36px",
            id: "logo-image",
            src: this.config.logoimage,
            "class": "logo"
          }, link || logoNode);
          if (this.config.titlefontsize) {
            query("#logo-image").forEach(lang.hitch(this, function (node) {
              domStyle.set(node, "width", this.config.titlefontsize);
              domStyle.set(node, "height", this.config.titlefontsize);
            }));
          }
        }


        //Set the popup theme so it doesn't use sprite also update colors

        domClass.add(this.map.infoWindow.domNode, "light");
        query(".esriPopup .pointer").style("backgroundColor", this.config.theme.toString());
        query(".esriPopup .titlePane").style("backgroundColor", this.config.theme.toString());

        //Set the font color using the configured color value
        query(".esriPopup .titlePane").style("color", this.config.color.toString());
        query(".esriPopup .titleButton").style("color", this.config.color.toString());


        //Add a title
        this.config.title = this.config.title || response.itemInfo.item.title;
        //set browser tab title
        document.title = this.config.title;
        //add application title
        if (this.config.showtitle) {
          var title_node = dom.byId("titleDiv");
          title_node.innerHTML = this.config.title;

          if (this.config.titlefontsize) {
            domStyle.set(title_node, "font-size", this.config.titlefontsize);
          }
        } else {
          domClass.add(document.body, "no-title");
          this._updateView();
        }


        //create editor, details and legend
        this._createSidePanelContent(response.itemInfo);


        // remove loading class from body
        domClass.remove(document.body, "app-loading");
        this._addToolbarWidgets();
        this.loadMapWidgets();

        // map has been created. You can start using it.
        // If you need map to be loaded, listen for it's load event.
      }), this.reportError);
    },
    _createSidePanelContent: function (itemInfo) {

      //legend, details, editor
      domClass.add(this.map.container, "has-sidepanel");
      //add the legend
      require(["application/sniff!legend?esri/dijit/Legend"], lang.hitch(this, function (Legend) {
        if (!Legend) {
          return;
        }
        var btn = this._createToolbarButton("legend_toggle", "icon-legend", this.config.i18n.tools.legendTool);
        domConstruct.place(btn, "toolbar-leading");
        on(btn, "click", lang.hitch(this, function () {
          this._navigateStack("legendPanel", "legend_toggle");
        }));

        this.legend = new Legend({
          map: this.map,
          layerInfos: (arcgisUtils.getLegendLayers(this.config.response))
        }, domConstruct.create("div", {}, "legendPanel"));

        this.legend.startup();

        if (this.config.showpanel && this.config.activepanel === "legend") {
          this._navigateStack("legendPanel", "legend_toggle");
        }

      }));
      this.config.description = this.config.description || itemInfo.item.description;
      if (this.config.description && this.config.showdescription) {
        //add the desc button to the toolbar
        var btn = this._createToolbarButton("details_toggle", "icon-file-text", this.config.i18n.tools.detailsTool);
        domConstruct.place(btn, "toolbar-leading");
        on(btn, "click", lang.hitch(this, function () {
          this._navigateStack("detailsPanel", "details_toggle");
        }));
        domConstruct.create("div", {
          innerHTML: this.config.description
        }, "detailsPanel");

        if (this.config.showpanel && this.config.activepanel === "details") {
          this._navigateStack("detailsPanel", "details_toggle");
        }
      }
      //add the editor
      require(["application/sniff!editor?esri/dijit/editing/Editor"], lang.hitch(this, function (Editor) {
        if (!Editor) {
          return;
        }
        var layers = this._getEditableLayers(this.config.response.itemInfo.itemData.operationalLayers);
        if (layers && layers.length === 0) {
          return;
        }
        var btn = this._createToolbarButton("edit_toggle", "icon-edit", this.config.i18n.tools.editTool);
        domConstruct.place(btn, "toolbar-leading");
        on(btn, "click", lang.hitch(this, function () {
          this._navigateStack("editorPanel", "edit_toggle");
          console.log("Editor Clicked");
        }));

        if (this.config.showpanel && this.config.activepanel === "editor") {
          this._navigateStack("editorPanel", "edit_toggle");
        }

      }));

    },
    _createToolbarButton: function (toolid, icon, label) {

      var button = domConstruct.create("button", {
        type: "icon-color button",
        id: toolid,
        title: label,
        innerHTML: "<span aria-hidden=true class='icon-color " + icon + "'></span><span class='tool-label'>" + label + "</span>"
      });
      return button;

    },
    _createContainer: function (galleryId, contentId) {
      var container = domConstruct.create("div", {
        id: galleryId,
        "className": "tool_container"
      }, dom.byId("mapDiv"));

      domConstruct.create("div", {
        "class": "container_box",
        innerHTML: "<div id='" + contentId + "'></div>"
      }, container);
      domUtils.hide(dom.byId(galleryId));
    },
    _closeContainers: function (container) {
      query(".tool_container").forEach(lang.hitch(this, function (container_node) {
        //close any open containers when another tool is open
        var visible = domStyle.get(container_node, "display");
        if (visible === "block" && (container !== container_node.id)) {
          domUtils.hide(container_node);
        }
      }));
      if (this.extentHandler) {
        this.extentHandler.pause();
      }
      //remove any selected styles
      query("#toolbar-trailing .tool-selected").forEach(function (node) {
        if (node && node.id !== "table_toggle") {
          domClass.remove(node, "tool-selected");
        }
      });
      this._updateView();
    },
    _displayContainer: function (container, button) {
      this._closeContainers(container);
      this._updateView();
      var node = dom.byId(container);
      domUtils.toggle(node);
      if (domStyle.get(node, "display") === "none") {
        //remove tool selected style from node
        domClass.remove(dom.byId(button), "tool-selected");
      } else {
        //add the selected style
        domClass.add(dom.byId(button), "tool-selected");
      }
      var pos = domGeometry.position(dom.byId(button));

      var winWidth = win.getBox();
      var loc = Math.abs(winWidth.w - pos.x);
      loc = Math.abs(loc - pos.w);
      domStyle.set(node, "right", Math.ceil(loc) + "px");

    },
    _navigateStack: function (panelLabel, buttonLabel) {
      var stackContainer = registry.byId("stackContainer");
      //remove the selected class from all nodes
      query("#toolbar-leading .tool-selected").forEach(function (node) {
        domClass.remove(node, "tool-selected");
      });

      //Buttons can also act like toggles to show/hide the panel so
      //if we click the button for a panel that's already selected we close it
      var panel_width = domStyle.get("sideDiv", "width");
      if (panel_width > 0 && stackContainer.selectedChildWidget.id === panelLabel) {
        this._destroyEditor();
        domStyle.set(dom.byId("sideDiv"), "width", 0);
      } else { //toggle between the panels
        //add selected style to current node
        domClass.add(dom.byId(buttonLabel), "tool-selected");
        domStyle.set(dom.byId("sideDiv"), "width", this.config.panelwidth + "px");
        stackContainer.selectChild(panelLabel);
        if (panelLabel === "editorPanel") {
          this._createEditor();
        } else {
          this._destroyEditor();
        }
      }
      this._updateView();
    },

    _getEditableLayers: function (layers) {
      var layerInfos = [];
      array.forEach(layers, lang.hitch(this, function (layer) {
        if (layer && layer.layerObject) {
          var eLayer = layer.layerObject;
          if (eLayer instanceof FeatureLayer && eLayer.isEditable()) {
            layerInfos.push({
              "featureLayer": eLayer
            });
          }
        }
      }));
      return layerInfos;
    },
    _openTable: function (table) {
      //enable click handler for layer
      if (this.tableHandler) {
        this.tableHandler.resume();
      }
      if (this.table) {
        this.table.zoomToSelection = true;
      }
      /*if (this.tableSelectionHandler) {
          this.tableSelectionHandler.resume();
      }*/
      domStyle.set(table, "height", "30%");

    },
    _closeTable: function (table, layer) {
      if (this.tableHandler) {
        this.tableHandler.pause();
      }
      if (this.table) {
        this.table.zoomToSelection = false;
      }
      /*  if (this.tableSelectionHandler) {
          this.tableSelectionHandler.pause();
        }*/
      domStyle.set(table, "height", 0);
    },
    _createEditor: function () {
      //add the editor
      require(["application/sniff!editor?esri/dijit/editing/Editor"], lang.hitch(this, function (Editor) {
        if (!Editor) {
          return;
        }
        this._destroyEditor();

        this.map.setInfoWindowOnClick(false);
        var editableLayers = this._getEditableLayers(this.config.response.itemInfo.itemData.operationalLayers);

        //add field infos if necessary. Field infos will contain hints if defined in the popup and hide fields where visible is set
        //to false. The popup logic takes care of this for the info window but not the edit window.
        //add field infos if necessary. Field infos will contain hints if defined in the popup and hide fields where visible is set
        //to false. The popup logic takes care of this for the info window but not the edit window.
        array.forEach(this.editableLayers, lang.hitch(this,
          function (layer) {
            if (layer.featureLayer && layer.featureLayer.infoTemplate &&
              layer.featureLayer.infoTemplate.info && layer
              .featureLayer.infoTemplate.info.fieldInfos) {
              //only display visible fields
              var fields = layer.featureLayer.infoTemplate.info
                .fieldInfos;
              var fieldInfos = [];
              array.forEach(fields, lang.hitch(this,
                function (field) {
                  //added support for editing date and time
                  if (field.format && field.format.dateFormat &&
                    array.indexOf(this.timeFormats,
                      field.format.dateFormat) > -1) {
                    field.format = {
                      time: true
                    };
                  }
                  //Only add visible fields
                  if (field.visible) {
                    fieldInfos.push(field);
                  }
                }));

              layer.fieldInfos = fieldInfos;
            }
          }));
        var settings = {
          map: this.map,
          layerInfos: editableLayers,
          toolbarVisible: true
        };
        this.map.enableSnapping();
        this.editor = new Editor({
          settings: settings
        }, domConstruct.create("div", {}, "editorPanel"));

        this.editor.startup();

      }));
    },
    _destroyEditor: function () {
      if (this.editor) {
        this.editor.destroy();
        this.editor = null;
        this.map.setInfoWindowOnClick(true);
      }
    },
    _updateView: function () {
      if (this.map) {
        this.map.resize();
        this.map.reposition();
        registry.byId("bc").resize();
        registry.byId("mapbc").resize();
      }
    },
    _updateTheme: function () {
      //Set the Slider +/- color to match the icon style.
      //Also update the menu icon to match the tool color.
      query(".tool-label").style("color", this.config.color.toString());
      query("[class^='icon-'], [class*=' icon-']").style("color", this.config.iconcolortheme.toString());
      this._updateView();
    }
  });
});