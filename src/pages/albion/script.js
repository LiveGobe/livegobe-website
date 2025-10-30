import $ from "jquery";
import i18n from "../../js/repack-locales";
import recipes from "../../js/albion-recipes";

await i18n.init();

let marketData = {};

// Helper function to format "how long ago"
function timeAgo(timestamp) {
    if (!timestamp) return "Unknown time";
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000); // seconds
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
}

$(() => {
    $("#refining").show();
    $("nav span").first().addClass("active");
    // Get initial data of the market prices
    $.ajax({
        url: `/api/v2/albion/market_data`,
        method: "GET",
        dataType: "json",
        success: function(data) {
            marketData = data;
            main();
        },
        error: function(err) {
            console.error("Error fetching refining data:", err);
        }
    });

    async function main() {
        // Start the table with ore refining data in martlock
        // Each city has items with the following format: T<Tier>_<NAME>@<Enchantment> - these are item objects
        // Example: T4_ORE@0
        // Each item object has the following properties:
        // - sell: selling price
        // - buy: buying price
        // - timestamp: timestamp of the last update
        // --------------------------
        // Each recipe is an object that has the following properties:
        // - name: name of the item
        // - type: type of the item (ore, wood, hide, fibre, stone)
        // - tier: tier of the item
        // - enchantment: enchantment of the item
        // - crafting: object with requirements for crafting the item
        // - outputs: number of outputs (default is 1)
        
        $("#refining-content-table-body").empty();
        let refiningType = "metalbar";
        let refiningCity = "3008"; // Martlock

        let craftingClass = "warrior";
        let craftingType = "shoes";
        let craftingItem = "soldier";
        let craftingCity = "3008"; // Martlock

        updateRefineTable();
        updateCraftingTable();

        $("nav span").on("click", function() {
            const tab = $(this).data("tab");
            $(".tab").hide();
            $("#" + tab).show();
            $("nav span").removeClass("active");
            $(this).addClass("active");
        });

        $("#refining-type").on("change", function() {
            refiningType = $(this).val();
            $("#refining-content-table-body").empty();
            updateRefineTable();
        });

        $("#refining-city").on("change", function() {
            refiningCity = $(this).val();
            $("#refining-content-table-body").empty();
            updateRefineTable();
        });

        $("#crafting-class").on("change", function() {
            craftingClass = $(this).val();
            switch (craftingClass) {
                case "warrior":
                    craftingType = "shoes";
                    craftingItem = "soldier";

                    $("#crafting-type").html(`
                        <option value="shoes">${i18n.t("page.albion.crafting.shoes")}</option>
                        <option value="armor">${i18n.t("page.albion.crafting.armor")}</option>
                        <option value="helmet">${i18n.t("page.albion.crafting.helmet")}</option>
                        <option value="sword">${i18n.t("page.albion.crafting.sword")}</option>
                        <option value="axe">${i18n.t("page.albion.crafting.axe")}</option>
                        <option value="mace">${i18n.t("page.albion.crafting.mace")}</option>
                        <option value="hammer">${i18n.t("page.albion.crafting.hammer")}</option>
                        <option value="gloves">${i18n.t("page.albion.crafting.gloves")}</option>
                        <option value="crossbow">${i18n.t("page.albion.crafting.crossbow")}</option>
                        <option value="shield">${i18n.t("page.albion.crafting.shield")}</option>
                    `);
                    break;
                case "mage":

                    break;
                case "hunter":
                    craftingType = "shoes";
                    craftingItem = "mercenary";

                    $("#crafting-type").html(`
                        <option value="shoes">${i18n.t("page.albion.crafting.shoes")}</option>
                        <option value="armor">${i18n.t("page.albion.crafting.armor")}</option>
                        <option value="helmet">${i18n.t("page.albion.crafting.helmet")}</option>
                        <option value="bow">${i18n.t("page.albion.crafting.bow")}</option>
                        <option value="dagger">${i18n.t("page.albion.crafting.dagger")}</option>
                        <option value="spear">${i18n.t("page.albion.crafting.spear")}</option>
                        <option value="quarterstaff">${i18n.t("page.albion.crafting.quarterstaff")}</option>
                        <option value="shapeshifter">${i18n.t("page.albion.crafting.shapeshifter")}</option>
                        <option value="nature_staff">${i18n.t("page.albion.crafting.nature_staff")}</option>
                        <option value="torch">${i18n.t("page.albion.crafting.torch")}</option>
                    `);
                    break;
            }
            $("#crafting-type").val(craftingType).trigger("change");
            $("#crafting-item").val(craftingItem).trigger("change");
            $("#crafting-content-table-body").empty();
            updateCraftingTable();
        });

        $("#crafting-type").on("change", function() {
            craftingType = $(this).val();
            switch (craftingType) {
                case "shoes":
                case "armor":
                case "helmet":
                    if (craftingClass === "warrior") {
                        craftingItem = "soldier";
                        $("#crafting-item").html(`
                            <option value="soldier">${i18n.t("page.albion.crafting.itemNames.soldier")}</option>
                            <option value="knight">${i18n.t("page.albion.crafting.itemNames.knight")}</option>
                            <option value="guardian">${i18n.t("page.albion.crafting.itemNames.guardian")}</option>
                            <option value="graveyard">${i18n.t("page.albion.crafting.itemNames.graveyard")}</option>
                            <option value="demon">${i18n.t("page.albion.crafting.itemNames.demon")}</option>
                            <option value="judicator">${i18n.t("page.albion.crafting.itemNames.judicator")}</option>
                            <option value="duskweaver">${i18n.t("page.albion.crafting.itemNames.duskweaver")}</option>
                            <option value="avalon" >${i18n.t("page.albion.crafting.itemNames.avalon")}</option>
                        `);
                    } else if (craftingClass === "mage") {
                        
                    } else if (craftingClass === "hunter") {
                        craftingItem = "mercenary";
                        $("#crafting-item").html(`
                            <option value="mercenary">${i18n.t("page.albion.crafting.itemNames.mercenary")}</option>
                            <option value="hunter">${i18n.t("page.albion.crafting.itemNames.hunter")}</option>
                            <option value="assassin">${i18n.t("page.albion.crafting.itemNames.assassin")}</option>
                            <option value="stalker">${i18n.t("page.albion.crafting.itemNames.stalker")}</option>
                            <option value="hellion">${i18n.t("page.albion.crafting.itemNames.hellion")}</option>
                            <option value="specter">${i18n.t("page.albion.crafting.itemNames.specter")}</option>
                            <option value="mistwalker">${i18n.t("page.albion.crafting.itemNames.mistwalker")}</option>
                            <option value="avalon">${i18n.t("page.albion.crafting.itemNames.avalon")}</option>
                        `);
                    }
                    break;
                case "sword":
                    craftingItem = "broadsword";
                    $("#crafting-item").html(`
                        <option value="broadsword">${i18n.t("page.albion.crafting.itemNames.broadsword")}</option>
                        <option value="claymore">${i18n.t("page.albion.crafting.itemNames.claymore")}</option>
                        <option value="dual_swords">${i18n.t("page.albion.crafting.itemNames.dual_swords")}</option>
                        <option value="clarent_blade">${i18n.t("page.albion.crafting.itemNames.clarent_blade")}</option>
                        <option value="carving_sword">${i18n.t("page.albion.crafting.itemNames.carving_sword")}</option>
                        <option value="galatine_pair">${i18n.t("page.albion.crafting.itemNames.galatine_pair")}</option>
                        <option value="kingmaker">${i18n.t("page.albion.crafting.itemNames.kingmaker")}</option>
                        <option value="infinity_blade">${i18n.t("page.albion.crafting.itemNames.infinity_blade")}</option>
                    `);
                    break;
                case "axe":
                    craftingItem = "battleaxe";
                    $("#crafting-item").html(`
                        <option value="battleaxe">${i18n.t("page.albion.crafting.itemNames.battleaxe")}</option>
                        <option value="greataxe">${i18n.t("page.albion.crafting.itemNames.greataxe")}</option>
                        <option value="halberd">${i18n.t("page.albion.crafting.itemNames.halberd")}</option>
                        <option value="carrioncaller">${i18n.t("page.albion.crafting.itemNames.carrioncaller")}</option>
                        <option value="infernal_scythe">${i18n.t("page.albion.crafting.itemNames.infernal_scythe")}</option>
                        <option value="bear_paws">${i18n.t("page.albion.crafting.itemNames.bear_paws")}</option>
                        <option value="realmbreaker">${i18n.t("page.albion.crafting.itemNames.realmbreaker")}</option>
                        <option value="crystal_reaver">${i18n.t("page.albion.crafting.itemNames.crystal_reaver")}</option>
                    `);
                    break;
                case "mace":
                    craftingItem = "mace";
                    $("#crafting-item").html(`
                        <option value="mace">${i18n.t("page.albion.crafting.itemNames.mace")}</option>
                        <option value="heavy_mace">${i18n.t("page.albion.crafting.itemNames.heavy_mace")}</option>
                        <option value="morning_star">${i18n.t("page.albion.crafting.itemNames.morning_star")}</option>
                        <option value="bedrock_mace">${i18n.t("page.albion.crafting.itemNames.bedrock_mace")}</option>
                        <option value="incubus_mace">${i18n.t("page.albion.crafting.itemNames.incubus_mace")}</option>
                        <option value="camlann_mace">${i18n.t("page.albion.crafting.itemNames.camlann_mace")}</option>
                        <option value="oathkeepers">${i18n.t("page.albion.crafting.itemNames.oathkeepers")}</option>
                        <option value="dreadstorm_monarch">${i18n.t("page.albion.crafting.itemNames.dreadstorm_monarch")}</option>
                    `);
                    break;
                case "hammer":
                    craftingItem = "hammer";
                    $("#crafting-item").html(`
                        <option value="hammer">${i18n.t("page.albion.crafting.itemNames.hammer")}</option>
                        <option value="polehammer">${i18n.t("page.albion.crafting.itemNames.polehammer")}</option>
                        <option value="great_hammer">${i18n.t("page.albion.crafting.itemNames.great_hammer")}</option>
                        <option value="tombhammer">${i18n.t("page.albion.crafting.itemNames.tombhammer")}</option>
                        <option value="forge_hammers">${i18n.t("page.albion.crafting.itemNames.forge_hammers")}</option>
                        <option value="grovekeeper">${i18n.t("page.albion.crafting.itemNames.grovekeeper")}</option>
                        <option value="hand_of_justice">${i18n.t("page.albion.crafting.itemNames.hand_of_justice")}</option>
                    `);
                    break;
                case "gloves":
                    craftingItem = "brawler_gloves";
                    $("#crafting-item").html(`
                        <option value="brawler_gloves">${i18n.t("page.albion.crafting.itemNames.brawler_gloves")}</option>
                        <option value="battle_bracers">${i18n.t("page.albion.crafting.itemNames.battle_bracers")}</option>
                        <option value="spiked_gauntlets">${i18n.t("page.albion.crafting.itemNames.spiked_gauntlets")}</option>
                        <option value="ursine_maulers">${i18n.t("page.albion.crafting.itemNames.ursine_maulers")}</option>
                        <option value="hellfire_hands">${i18n.t("page.albion.crafting.itemNames.hellfire_hands")}</option>
                        <option value="ravenstrike_cestus">${i18n.t("page.albion.crafting.itemNames.ravenstrike_cestus")}</option>
                        <option value="fists_of_avalon">${i18n.t("page.albion.crafting.itemNames.fists_of_avalon")}</option>
                        <option value="forcepulse_bracers">${i18n.t("page.albion.crafting.itemNames.forcepulse_bracers")}</option>
                    `);
                    break;
                case "crossbow":
                    craftingItem = "crossbow";
                    $("#crafting-item").html(`
                        <option value="crossbow">${i18n.t("page.albion.crafting.itemNames.crossbow")}</option>
                        <option value="heavy_crossbow">${i18n.t("page.albion.crafting.itemNames.heavy_crossbow")}</option>
                        <option value="light_crossbow">${i18n.t("page.albion.crafting.itemNames.light_crossbow")}</option>
                        <option value="weeping_repeater">${i18n.t("page.albion.crafting.itemNames.weeping_repeater")}</option>
                        <option value="boltcasters">${i18n.t("page.albion.crafting.itemNames.boltcasters")}</option>
                        <option value="siegebow">${i18n.t("page.albion.crafting.itemNames.siegebow")}</option>
                        <option value="energy_shaper">${i18n.t("page.albion.crafting.itemNames.energy_shaper")}</option>
                        <option value="arclight_blasters">${i18n.t("page.albion.crafting.itemNames.arclight_blasters")}</option>
                    `);
                    break;
                case "shield":
                    craftingItem = "shield";
                    $("#crafting-item").html(`
                        <option value="shield">${i18n.t("page.albion.crafting.itemNames.shield")}</option>
                        <option value="sarcophagus">${i18n.t("page.albion.crafting.itemNames.sarcophagus")}</option>
                        <option value="caitiff_shield">${i18n.t("page.albion.crafting.itemNames.caitiff_shield")}</option>
                        <option value="facebreaker">${i18n.t("page.albion.crafting.itemNames.facebreaker")}</option>
                        <option value="astral_aegis">${i18n.t("page.albion.crafting.itemNames.astral_aegis")}</option>
                    `);
                    break;
                case "bow":
                    craftingItem = "bow";
                    $("#crafting-item").html(`
                        <option value="bow">${i18n.t("page.albion.crafting.itemNames.bow")}</option>
                        <option value="warbow">${i18n.t("page.albion.crafting.itemNames.warbow")}</option>
                        <option value="longbow">${i18n.t("page.albion.crafting.itemNames.longbow")}</option>
                        <option value="whispering">${i18n.t("page.albion.crafting.itemNames.whispering")}</option>
                        <option value="wailing">${i18n.t("page.albion.crafting.itemNames.wailing")}</option>
                        <option value="badon">${i18n.t("page.albion.crafting.itemNames.badon")}</option>
                        <option value="mistpiercer">${i18n.t("page.albion.crafting.itemNames.mistpiercer")}</option>
                        <option value="skystrider">${i18n.t("page.albion.crafting.itemNames.skystrider")}</option>
                    `);
                    break;
                case "dagger":
                    craftingItem = "dagger";
                    $("#crafting-item").html(`
                        <option value="dagger">${i18n.t("page.albion.crafting.itemNames.dagger")}</option>
                    `);
            }
            $("#crafting-item").val(craftingItem).trigger("change");
            $("#crafting-content-table-body").empty();
            updateCraftingTable();
        });

        $("#crafting-item").on("change", function() {
            craftingItem = $(this).val();
            $("#crafting-content-table-body").empty();
            updateCraftingTable();
        });

        $("#crafting-city").on("change", function() {
            craftingCity = $(this).val();
            $("#crafting-content-table-body").empty();
            updateCraftingTable();
        });

        $(".update-market-data").on("click", function() {
            $.ajax({
                url: `/api/v2/albion/market_data`,
                method: "GET",
                dataType: "json",
                success: function(data) {
                    marketData = data;
                    // Recalculate all rows
                    $("#refining-content-table-body").empty();
                    updateRefineTable();
                    $("#crafting-content-table-body").empty();
                    updateCraftingTable();
                },
                error: function(err) {
                    console.error("Error fetching refining data:", err);
                }
            });
        });

        function updateRefineTable() {
            Object.entries(recipes)
            .filter(([_, recipe]) => recipe.type === refiningType)
            .forEach(([itemKey, recipe]) => {
                const craftingRequirements = recipe.crafting;
                const outputs = recipe.outputs || 1;
                const row = $("<tr></tr>");
                row.append($("<td></td>").text(recipe.name + ` (${recipe.tier}.${recipe.enchantment})`)); // Item name with tier and enchantment

                // Amount (outputs) input
                const amountInput = $(`<input type="number" value="${outputs}" min="1" />`);
                row.append($("<td></td>").append(amountInput));

                // Add empty cells for buy, sell, profit
                row.append($("<td></td>").text("")); // Buy cost
                row.append($("<td></td>").text("")); // Sell value
                row.append($("<td></td>").text("")); // Profit


                // Calculate costs
                function updateRow(outputCount) {
                    let buyDetails = [];

                    // Get usage fee from input (default 800 if not set)
                    const usageFeeRaw = parseInt($("#refining-usage-fee").val(), 10);
                    const usageFeeInput = isNaN(usageFeeRaw) ? 800 : usageFeeRaw;
                    // Get return rate from user input (default 0 if not set)
                    const returnRateInput = parseFloat($("#refining-return-rate").val()) || 0;
                    const returnRate = Math.max(0, Math.min(returnRateInput, 100)) / 100; // Clamp between 0 and 100, convert to decimal
                    const effectiveRate = 1 - returnRate;

                    // Calculate usage fee for this recipe
                    const usageFeePerOutput = Math.ceil(((recipe.value * 0.1125) * usageFeeInput) / 100);
                    const totalUsageFee = usageFeePerOutput * outputCount;

                    // Calculate total buy cost for all required resources (before return rate)
                    let totalRawBuyCost = 0;
                    for (const [item, amount] of Object.entries(craftingRequirements)) {
                        const inputKey = `${item}`;
                        const itemData = marketData[refiningCity]?.[inputKey];
                        let cost = 0;
                        const totalRequired = amount * outputCount;
                        let timeAgoStr = "";
                        if (itemData) {
                            cost = itemData.sell * totalRequired;
                            totalRawBuyCost += cost;
                            timeAgoStr = itemData.timestamp ? ` (${timeAgo(new Date(itemData.timestamp))})` : "";
                        }
                        buyDetails.push(
                            `${item}: ${itemData ? itemData.sell : "N/A"} x ${totalRequired} = ${itemData ? cost : "N/A"}${timeAgoStr}`
                        );
                    }

                    // Apply return rate to total silver cost
                    const adjustedBuyCost = Math.ceil(totalRawBuyCost * effectiveRate);
                    buyDetails.push(`Return Rate Applied: -${Math.round(returnRate * 100)}% (${totalRawBuyCost} → ${adjustedBuyCost})`);

                    // Add usage fee to tooltip
                    buyDetails.push(
                        `Usage Fee: ${usageFeePerOutput} x ${outputCount} = ${totalUsageFee}`
                    );

                    // Use the recipes object key for the output
                    const outputKey = `${itemKey}`;
                    const outputData = marketData[refiningCity]?.[outputKey];
                    let totalSellValue = 0;
                    let outputTimeAgo = "";
                    if (outputData) {
                        totalSellValue = outputData.sell * outputCount;
                        outputTimeAgo = outputData.timestamp ? ` (${timeAgo(new Date(outputData.timestamp))})` : "";
                    }

                    // Add 10.5% tax to tooltip (correct: tax is on sell value)
                    buyDetails.push(
                        `Tax (10.5%): ${Math.ceil(totalSellValue * 0.105)}`
                    );

                    // Add "how long ago" info to tooltip for the output item (on same line)
                    if (outputData) {
                        buyDetails.push(`Sell value: ${outputData.sell} x ${outputCount} = ${totalSellValue}${outputTimeAgo}`);
                    }

                    // Show total cost for all inputs and sell value for outputs
                    row.find("td").eq(2)
                        .text(adjustedBuyCost > 0 ? (adjustedBuyCost + totalUsageFee) : "N/A") // FIX: do not include tax in buy cost
                        .attr("title", buyDetails.join('\n'));
                    row.find("td").eq(3).text(totalSellValue > 0 ? totalSellValue : "N/A");

                    // Profit = (sell value - tax) - (buy cost after return rate + usage fee)
                    const anyNaN = buyDetails.some(detail => detail.includes("N/A")) || totalSellValue <= 0;
                    const profit = totalSellValue - Math.ceil(totalSellValue * 0.105) - adjustedBuyCost - totalUsageFee;
                    row.find("td").eq(4).text(!anyNaN && isFinite(profit) ? Math.floor(profit) : "N/A");

                    // Move tooltip to the entire row instead of just buy price cell
                    row.attr("title", buyDetails.join('\n'));
                }

                // Initial calculation
                updateRow(outputs);

                // Update on input change
                amountInput.on("input", function () {
                    let val = parseInt($(this).val(), 10);
                    if (isNaN(val) || val < 1) val = 1;
                    $(this).val(val);
                    updateRow(val);
                });

                // Update on return rate change
                $("#refining-return-rate").on("input", function () {
                    let val = parseInt(amountInput.val(), 10);
                    if (isNaN(val) || val < 1) val = 1;
                    updateRow(val);
                });

                // Update on usage fee change
                $("#refining-usage-fee").on("input", function () {
                    let val = parseInt(amountInput.val(), 10);
                    if (isNaN(val) || val < 1) val = 1;
                    updateRow(val);
                });

                $("#refining-content-table-body").append(row);
            });
        }

        function updateCraftingTable() {
            Object.entries(recipes)
            .filter(([_, recipe]) => recipe.type === craftingType && recipe.class === craftingClass && recipe.item === craftingItem)
            .forEach(([itemKey, recipe]) => {
                const craftingRequirements = recipe.crafting;
                const outputs = recipe.outputs || 1;
                const row = $("<tr></tr>");
                row.append($("<td></td>").text(recipe.name + ` (${recipe.tier}.${recipe.enchantment})`)); // Item name with tier and enchantment

                // Amount (outputs) input
                const amountInput = $(`<input type="number" value="${outputs}" min="1" />`);
                row.append($("<td></td>").append(amountInput));

                // Add empty cells for buy, sell, profit
                row.append($("<td></td>").text("")); // Buy cost
                row.append($("<td></td>").text("")); // Sell value
                row.append($("<td></td>").text("")); // Profit

                // Calculate costs
                function updateRow(outputCount) {
                    let buyDetails = [];

                    // Get usage fee from input (default 800 if not set)
                    const usageFeeRaw = parseInt($("#crafting-usage-fee").val(), 10);
                    const usageFeeInput = isNaN(usageFeeRaw) ? 800 : usageFeeRaw;
                    // Get return rate from user input (default 0 if not set)
                    const returnRateInput = parseFloat($("#crafting-return-rate").val()) || 0;
                    const returnRate = Math.max(0, Math.min(returnRateInput, 100)) / 100; // Clamp between 0 and 100, convert to decimal
                    const effectiveRate = 1 - returnRate;

                    // Calculate usage fee for this recipe (same formula as refining for now)
                    const usageFeePerOutput = Math.ceil(((recipe.value * 0.1125) * usageFeeInput) / 100);
                    const totalUsageFee = usageFeePerOutput * outputCount;

                    // Calculate total buy cost for all required resources (before return rate)
                    let totalRawBuyCost = 0;
                    let totalAdjustedBuyCost = 0;
                    for (const [item, itemDataObj] of Object.entries(craftingRequirements)) {
                        const inputKey = `${item}`;
                        const itemMarketData = marketData[craftingCity]?.[inputKey];
                        const amount = itemDataObj.amount || 0;
                        const isReturnable = itemDataObj.return !== false;
                        let cost = 0;
                        let adjustedCost = 0;
                        const totalRequired = amount * outputCount;
                        let timeAgoStr = "";
                        if (itemMarketData) {
                            cost = itemMarketData.sell * totalRequired;
                            if (isReturnable) {
                                adjustedCost = Math.ceil(cost * effectiveRate);
                            } else {
                                adjustedCost = cost; // Not affected by return rate
                            }
                            totalRawBuyCost += cost;
                            totalAdjustedBuyCost += adjustedCost;
                            timeAgoStr = itemMarketData.timestamp ? ` (${timeAgo(new Date(itemMarketData.timestamp))})` : "";
                        }
                        buyDetails.push(
                            `${item}: ${itemMarketData ? itemMarketData.sell : "N/A"} x ${totalRequired} = ${itemMarketData ? cost : "N/A"}${isReturnable ? (itemMarketData ? ` → ${adjustedCost}` : "") : " (no return)"}${timeAgoStr}`
                        );
                    }

                    // Show return rate effect in tooltip (only for returnable resources)
                    const returnableItems = Object.entries(craftingRequirements)
                        .filter(([_, itemDataObj]) => itemDataObj.return !== false)
                        .map(([item]) => item);
                    if (returnableItems.length > 0) {
                        buyDetails.push(`Return Rate Applied: -${Math.round(returnRate * 100)}% (only for: ${returnableItems.join(", ")})`);
                    } else {
                        buyDetails.push("Return Rate Applied: 0% (no resources affected)");
                    }

                    // Add usage fee to tooltip
                    buyDetails.push(
                        `Usage Fee: ${usageFeePerOutput} x ${outputCount} = ${totalUsageFee}`
                    );

                    // Use the recipes object key for the output
                    const outputKey = `${itemKey}`;
                    const outputData = marketData[craftingCity]?.[outputKey];
                    let totalSellValue = 0;
                    let outputTimeAgo = "";
                    if (outputData) {
                        totalSellValue = outputData.sell * outputCount;
                        outputTimeAgo = outputData.timestamp ? ` (${timeAgo(new Date(outputData.timestamp))})` : "";
                    }

                    // Add 10.5% tax to tooltip (same as refining)
                    buyDetails.push(
                        `Tax (10.5%): ${Math.ceil(totalSellValue * 0.105)}`
                    );

                    // Add "how long ago" info to tooltip for the output item (on same line)
                    if (outputData) {
                        buyDetails.push(`Sell value: ${outputData.sell} x ${outputCount} = ${totalSellValue}${outputTimeAgo}`);
                    }

                    // Show total cost for all inputs and sell value for outputs
                    row.find("td").eq(2)
                        .text(totalAdjustedBuyCost > 0 ? (totalAdjustedBuyCost + totalUsageFee) : "N/A")
                        .attr("title", buyDetails.join('\n'));
                    row.find("td").eq(3).text(totalSellValue > 0 ? totalSellValue : "N/A");

                    // Profit = (sell value - tax) - (buy cost after return rate + usage fee)
                    const anyNaN = buyDetails.some(detail => detail.includes("N/A")) || totalSellValue <= 0;
                    const profit = totalSellValue - Math.ceil(totalSellValue * 0.105) - totalAdjustedBuyCost - totalUsageFee;
                    row.find("td").eq(4).text(!anyNaN && isFinite(profit) ? Math.floor(profit) : "N/A");

                    // Move tooltip to the entire row instead of just buy price cell
                    row.attr("title", buyDetails.join('\n'));
                }

                // Initial calculation
                updateRow(outputs);

                // Update on input change
                amountInput.on("input", function () {
                    let val = parseInt($(this).val(), 10);
                    if (isNaN(val) || val < 1) val = 1;
                    $(this).val(val);
                    updateRow(val);
                });

                // Update on return rate change
                $("#crafting-return-rate").on("input", function () {
                    let val = parseInt(amountInput.val(), 10);
                    if (isNaN(val) || val < 1) val = 1;
                    updateRow(val);
                });

                // Update on usage fee change
                $("#crafting-usage-fee").on("input", function () {
                    let val = parseInt(amountInput.val(), 10);
                    if (isNaN(val) || val < 1) val = 1;
                    updateRow(val);
                });

                $("#crafting-content-table-body").append(row);
            });
        }
    }
});