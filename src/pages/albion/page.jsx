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
                                <option value="3008">{props.t("page.albion.refining.martlock")}</option>
                                <option value="7">{props.t("page.albion.refining.thetford")}</option>
                                <option value="4002">{props.t("page.albion.refining.fortsterling")}</option>
                                <option value="1002">{props.t("page.albion.refining.lymhurst")}</option>
                                <option value="2004">{props.t("page.albion.refining.bridgewatch")}</option>
                                <option value="3005">{props.t("page.albion.refining.caerleon")}</option>
                                <option value="5003">{props.t("page.albion.refining.brecilien")}</option>
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
                            <button type="button" id="update-market-data">
                                {props.t("page.albion.refining.update")}
                            </button>
                            <div id="refining-content-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>{props.t("page.albion.refining.item")}</th>
                                            <th>{props.t("page.albion.refining.amount")}</th>
                                            <th>{props.t("page.albion.refining.buycost")}</th>
                                            <th>{props.t("page.albion.refining.sellcost")}</th>
                                            <th>{props.t("page.albion.refining.profit")}</th>
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
                        <div id="crafting-content"></div>
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