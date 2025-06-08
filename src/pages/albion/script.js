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
        url: `http://localhost:1000/api/market-data`,
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

        updateTable();

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
            updateTable();
        });

        $("#refining-city").on("change", function() {
            refiningCity = $(this).val();
            $("#refining-content-table-body").empty();
            updateTable();
        });

        $("#update-market-data").on("click", function() {
            $.ajax({
                url: `http://localhost:1000/api/market-data`,
                method: "GET",
                dataType: "json",
                success: function(data) {
                    marketData = data;
                    // Recalculate all rows
                    $("#refining-content-table-body").empty();
                    updateTable();
                },
                error: function(err) {
                    console.error("Error fetching refining data:", err);
                }
            });
        });

        function updateTable() {
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
    }
});