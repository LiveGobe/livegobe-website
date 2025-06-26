const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.albion.pagename")}>
                <Bundle name="albion.js" />
                <Bundle name="albion.css" />
            </Head>
            <body data-theme={props.theme}>
                <nav>
                    <span data-tab="refining">Refining</span> |
                    <span data-tab="crafting">Item Crafting</span> |
                    <span data-tab="consumables">Consumables</span>
                </nav>
                <div id="calc-body">
                    <div id="refining" className="tab" style={{ display: "none" }}>
                        <h1>{props.t("page.albion.refining.title")}</h1>
                        <p>{props.t("page.albion.refining.description")}</p>
                        <div id="refining-content">
                            <select name="refining-city" id="refining-city">
                                <option value="3008">{props.t("page.albion.common.cities.martlock")}</option>
                                <option value="7">{props.t("page.albion.common.cities.thetford")}</option>
                                <option value="4002">{props.t("page.albion.common.cities.fortsterling")}</option>
                                <option value="1002">{props.t("page.albion.common.cities.lymhurst")}</option>
                                <option value="2004">{props.t("page.albion.common.cities.bridgewatch")}</option>
                                <option value="3005">{props.t("page.albion.common.cities.caerleon")}</option>
                                <option value="5003">{props.t("page.albion.common.cities.brecilien")}</option>
                            </select>
                            <select name="refining-type" id="refining-type">
                                <option value="metalbar">{props.t("page.albion.refining.ore")}</option>
                                <option value="plank">{props.t("page.albion.refining.wood")}</option>
                                <option value="leather">{props.t("page.albion.refining.hide")}</option>
                                <option value="cloth">{props.t("page.albion.refining.fibre")}</option>
                                <option value="stoneblock">{props.t("page.albion.refining.stone")}</option>
                            </select>
                            <label htmlFor={props.t("page.albion.refining.usage-fee")}>
                                {props.t("page.albion.refining.usage-fee") + ": "}
                            </label>
                            <input type="number" id="refining-usage-fee" placeholder={props.t("page.albion.refining.usage-fee")} defaultValue="800" min="0" max="1000" />
                            <label htmlFor={props.t("page.albion.refining.return-rate")}>
                                {props.t("page.albion.refining.return-rate") + ": "}
                            </label>
                            <input type="number" id="refining-return-rate" placeholder={props.t("page.albion.refining.return-rate")} defaultValue="15.2" min="0" max="100" step="0.1" />
                            <button type="button" id="update-market-data-refining" className="update-market-data">
                                {props.t("page.albion.refining.update")}
                            </button>
                            <div id="refining-content-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>{props.t("page.albion.common.tableHeaders.item")}</th>
                                            <th>{props.t("page.albion.common.tableHeaders.amount")}</th>
                                            <th>{props.t("page.albion.common.tableHeaders.buycost")}</th>
                                            <th>{props.t("page.albion.common.tableHeaders.sellcost")}</th>
                                            <th>{props.t("page.albion.common.tableHeaders.profit")}</th>
                                        </tr>
                                    </thead>
                                    <tbody id="refining-content-table-body">
                                        {/* Content will be dynamically inserted here */}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div id="crafting" className="tab" style={{ display: "none" }}>
                        <h1>{props.t("page.albion.crafting.title")}</h1>
                        <p>{props.t("page.albion.crafting.description")}</p>
                        <div id="crafting-content">
                            <select name="crafting-city" id="crafting-city">
                                <option value="3008">{props.t("page.albion.common.cities.martlock")}</option>
                                <option value="7">{props.t("page.albion.common.cities.thetford")}</option>
                                <option value="4002">{props.t("page.albion.common.cities.fortsterling")}</option>
                                <option value="1002">{props.t("page.albion.common.cities.lymhurst")}</option>
                                <option value="2004">{props.t("page.albion.common.cities.bridgewatch")}</option>
                                <option value="3005">{props.t("page.albion.common.cities.caerleon")}</option>
                                <option value="5003">{props.t("page.albion.common.cities.brecilien")}</option>
                            </select>
                            <select name="crafting-class" id="crafting-class">
                                <option value="warrior">{props.t("page.albion.crafting.warrior")}</option>
                            </select>
                            {/* different classes have different types, which should be shown dynamically */}
                            <select name="crafting-type" id="crafting-type">
                                <option value="shoes">{props.t("page.albion.crafting.shoes")}</option>
                                <option value="armor">{props.t("page.albion.crafting.armor")}</option>
                                <option value="helmet">{props.t("page.albion.crafting.helmet")}</option>
                                <option value="sword">{props.t("page.albion.crafting.sword")}</option>
                                <option value="axe">{props.t("page.albion.crafting.axe")}</option>
                                <option value="mace">{props.t("page.albion.crafting.mace")}</option>
                                <option value="hammer">{props.t("page.albion.crafting.hammer")}</option>
                                <option value="gloves">{props.t("page.albion.crafting.gloves")}</option>
                                <option value="crossbow">{props.t("page.albion.crafting.crossbow")}</option>
                                <option value="shield">{props.t("page.albion.crafting.shield")}</option>
                            </select>
                            {/* different types have different items, which should be shown dynamically */}
                            <select name="crafting-item" id="crafting-item">
                                <option value="soldier">{props.t("page.albion.crafting.itemNames.soldier")}</option>
                                <option value="knight">{props.t("page.albion.crafting.itemNames.knight")}</option>
                                <option value="guardian">{props.t("page.albion.crafting.itemNames.guardian")}</option>
                                <option value="graveyard">{props.t("page.albion.crafting.itemNames.graveyard")}</option>
                                <option value="demon">{props.t("page.albion.crafting.itemNames.demon")}</option>
                                <option value="judicator">{props.t("page.albion.crafting.itemNames.judicator")}</option>
                                <option value="duskweaver">{props.t("page.albion.crafting.itemNames.duskweaver")}</option>
                                <option value="avalon" >{props.t("page.albion.crafting.itemNames.avalon")}</option>
                            </select>
                            <label htmlFor={props.t("page.albion.crafting.usage-fee")}>
                                {props.t("page.albion.crafting.usage-fee") + ": "}
                            </label>
                            <input type="number" id="crafting-usage-fee" placeholder={props.t("page.albion.crafting.usage-fee")} defaultValue="800" min="0" max="1000" />
                            <label htmlFor={props.t("page.albion.crafting.return-rate")}>
                                {props.t("page.albion.crafting.return-rate") + ": "}
                            </label>
                            <input type="number" id="crafting-return-rate" placeholder={props.t("page.albion.crafting.return-rate")} defaultValue="15.2" min="0" max="100" step="0.1" />
                            <button type="button" id="update-market-data-crafting" className="update-market-data">
                                {props.t("page.albion.crafting.update")}
                            </button>
                            <div id="crafting-content-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>{props.t("page.albion.common.tableHeaders.item")}</th>
                                            <th>{props.t("page.albion.common.tableHeaders.amount")}</th>
                                            <th>{props.t("page.albion.common.tableHeaders.buycost")}</th>
                                            <th>{props.t("page.albion.common.tableHeaders.sellcost")}</th>
                                            <th>{props.t("page.albion.common.tableHeaders.profit")}</th>
                                        </tr>
                                    </thead>
                                    <tbody id="crafting-content-table-body">
                                        {/* Content will be dynamically inserted here */}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div id="consumables" className="tab" style={{ display: "none" }}>
                        <h1>{props.t("page.albion.consumables.title")}</h1>
                        <p>{props.t("page.albion.consumables.description")}</p>
                        <div id="consumables-content"></div>
                    </div>
                </div>
                <footer>
                    <span id="copyright">{props.t("copyright")}</span>
                </footer>
            </body>
        </html>
    )
}