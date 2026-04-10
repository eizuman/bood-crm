// BJCP 2021 Beer Style Guidelines
// Each entry: { code, name, category, og: [min,max], fg: [min,max], ibu: [min,max], ebc: [min,max], abv: [min,max] }

export const BJCP_STYLES = [
  // 1. Standard American Beer
  { code:'1A', name:'American Light Lager',       category:'Standard American Beer',          og:[1.028,1.040], fg:[0.998,1.008], ibu:[8,12],   ebc:[2,5],    abv:[2.8,4.2] },
  { code:'1B', name:'American Lager',             category:'Standard American Beer',          og:[1.040,1.050], fg:[1.004,1.010], ibu:[8,18],   ebc:[2,6],    abv:[4.2,5.3] },
  { code:'1C', name:'Cream Ale',                  category:'Standard American Beer',          og:[1.042,1.055], fg:[1.006,1.012], ibu:[8,20],   ebc:[3,7],    abv:[4.2,5.6] },
  { code:'1D', name:'American Wheat Beer',        category:'Standard American Beer',          og:[1.040,1.055], fg:[1.008,1.013], ibu:[15,30],  ebc:[2,7],    abv:[4.0,5.5] },
  // 2. International Lager
  { code:'2A', name:'International Pale Lager',   category:'International Lager',             og:[1.042,1.050], fg:[1.008,1.012], ibu:[18,25],  ebc:[4,8],    abv:[4.6,6.0] },
  { code:'2B', name:'International Amber Lager',  category:'International Lager',             og:[1.042,1.055], fg:[1.008,1.014], ibu:[8,25],   ebc:[20,40],  abv:[4.6,6.0] },
  { code:'2C', name:'International Dark Lager',   category:'International Lager',             og:[1.044,1.056], fg:[1.008,1.012], ibu:[8,20],   ebc:[28,70],  abv:[4.2,6.0] },
  // 3. Czech Lager
  { code:'3A', name:'Czech Pale Lager',           category:'Czech Lager',                     og:[1.028,1.044], fg:[1.008,1.014], ibu:[20,35],  ebc:[6,12],   abv:[3.0,4.1] },
  { code:'3B', name:'Czech Premium Pale Lager',   category:'Czech Lager',                     og:[1.044,1.060], fg:[1.013,1.017], ibu:[30,45],  ebc:[6,12],   abv:[4.2,5.8] },
  { code:'3C', name:'Czech Amber Lager',          category:'Czech Lager',                     og:[1.044,1.060], fg:[1.013,1.017], ibu:[20,35],  ebc:[24,40],  abv:[4.4,5.8] },
  { code:'3D', name:'Czech Dark Lager',           category:'Czech Lager',                     og:[1.044,1.060], fg:[1.013,1.017], ibu:[18,34],  ebc:[40,95],  abv:[4.4,5.8] },
  // 4. Pale Malty European Lager
  { code:'4A', name:'Munich Helles',              category:'Pale Malty European Lager',       og:[1.044,1.048], fg:[1.006,1.012], ibu:[16,22],  ebc:[4,7],    abv:[4.7,5.4] },
  { code:'4B', name:'Festbier',                   category:'Pale Malty European Lager',       og:[1.054,1.057], fg:[1.010,1.012], ibu:[18,25],  ebc:[5,7],    abv:[5.8,6.3] },
  { code:'4C', name:'Helles Bock',                category:'Pale Malty European Lager',       og:[1.064,1.069], fg:[1.011,1.018], ibu:[23,35],  ebc:[5,11],   abv:[6.3,7.4] },
  // 5. Pale Bitter European Beer
  { code:'5A', name:'German Leichtbier',          category:'Pale Bitter European Beer',       og:[1.026,1.034], fg:[1.006,1.010], ibu:[15,28],  ebc:[2,5],    abv:[2.4,3.6] },
  { code:'5B', name:'Kölsch',                     category:'Pale Bitter European Beer',       og:[1.044,1.050], fg:[1.007,1.011], ibu:[18,30],  ebc:[4,7],    abv:[4.4,5.2] },
  { code:'5C', name:'German Helles Exportbier',   category:'Pale Bitter European Beer',       og:[1.048,1.056], fg:[1.010,1.015], ibu:[20,30],  ebc:[4,7],    abv:[4.8,6.0] },
  { code:'5D', name:'German Pils',                category:'Pale Bitter European Beer',       og:[1.044,1.050], fg:[1.008,1.013], ibu:[22,40],  ebc:[4,7],    abv:[4.4,5.2] },
  // 6. Amber Malty European Lager
  { code:'6A', name:'Märzen',                     category:'Amber Malty European Lager',      og:[1.054,1.060], fg:[1.010,1.014], ibu:[18,24],  ebc:[14,28],  abv:[5.8,6.3] },
  { code:'6B', name:'Rauchbier',                  category:'Amber Malty European Lager',      og:[1.050,1.057], fg:[1.012,1.016], ibu:[20,30],  ebc:[14,28],  abv:[4.8,6.0] },
  { code:'6C', name:'Dunkles Bock',               category:'Amber Malty European Lager',      og:[1.064,1.072], fg:[1.013,1.019], ibu:[20,27],  ebc:[28,47],  abv:[6.3,7.2] },
  // 7. Amber Bitter European Beer
  { code:'7A', name:'Vienna Lager',               category:'Amber Bitter European Beer',      og:[1.048,1.055], fg:[1.010,1.014], ibu:[18,30],  ebc:[16,34],  abv:[4.7,5.5] },
  { code:'7B', name:'Altbier',                    category:'Amber Bitter European Beer',      og:[1.044,1.052], fg:[1.008,1.014], ibu:[25,50],  ebc:[26,40],  abv:[4.3,5.5] },
  { code:'7C', name:'Kellerbier',                 category:'Amber Bitter European Beer',      og:[1.048,1.054], fg:[1.012,1.016], ibu:[25,40],  ebc:[14,34],  abv:[4.7,5.4] },
  // 8. Dark European Lager
  { code:'8A', name:'Munich Dunkel',              category:'Dark European Lager',             og:[1.048,1.056], fg:[1.010,1.016], ibu:[18,28],  ebc:[28,56],  abv:[4.5,5.6] },
  { code:'8B', name:'Schwarzbier',                category:'Dark European Lager',             og:[1.046,1.052], fg:[1.010,1.016], ibu:[20,35],  ebc:[28,47],  abv:[4.4,5.4] },
  // 9. Strong European Beer
  { code:'9A', name:'Doppelbock',                 category:'Strong European Beer',            og:[1.072,1.112], fg:[1.016,1.024], ibu:[16,26],  ebc:[23,47],  abv:[7.0,10.0] },
  { code:'9B', name:'Eisbock',                    category:'Strong European Beer',            og:[1.078,1.120], fg:[1.020,1.035], ibu:[25,35],  ebc:[30,70],  abv:[9.0,14.0] },
  { code:'9C', name:'Baltic Porter',              category:'Strong European Beer',            og:[1.060,1.090], fg:[1.016,1.024], ibu:[20,40],  ebc:[40,90],  abv:[6.5,9.5] },
  // 10. German Wheat Beer
  { code:'10A', name:'Weizen',                    category:'German Wheat Beer',               og:[1.044,1.052], fg:[1.010,1.014], ibu:[8,15],   ebc:[4,10],   abv:[4.3,5.6] },
  { code:'10B', name:'Dunkles Weizen',            category:'German Wheat Beer',               og:[1.044,1.056], fg:[1.010,1.014], ibu:[10,18],  ebc:[24,47],  abv:[4.3,5.6] },
  { code:'10C', name:'Weizenbock',                category:'German Wheat Beer',               og:[1.064,1.090], fg:[1.015,1.022], ibu:[15,30],  ebc:[24,70],  abv:[6.5,9.0] },
  // 11. British Bitter
  { code:'11A', name:'Ordinary Bitter',           category:'British Bitter',                  og:[1.030,1.039], fg:[1.007,1.011], ibu:[25,35],  ebc:[16,28],  abv:[3.2,3.8] },
  { code:'11B', name:'Best Bitter',               category:'British Bitter',                  og:[1.040,1.048], fg:[1.008,1.012], ibu:[25,40],  ebc:[16,28],  abv:[3.8,4.6] },
  { code:'11C', name:'Strong Bitter',             category:'British Bitter',                  og:[1.048,1.060], fg:[1.010,1.016], ibu:[30,50],  ebc:[16,35],  abv:[4.6,6.2] },
  // 12. Pale Commonwealth Beer
  { code:'12A', name:'British Golden Ale',        category:'Pale Commonwealth Beer',          og:[1.038,1.053], fg:[1.006,1.012], ibu:[20,45],  ebc:[4,12],   abv:[3.8,5.0] },
  { code:'12B', name:'Australian Sparkling Ale',  category:'Pale Commonwealth Beer',          og:[1.042,1.050], fg:[1.004,1.006], ibu:[20,35],  ebc:[7,12],   abv:[4.5,6.0] },
  { code:'12C', name:'English IPA',               category:'Pale Commonwealth Beer',          og:[1.050,1.075], fg:[1.010,1.018], ibu:[40,60],  ebc:[12,28],  abv:[5.0,7.5] },
  // 13. Brown British Beer
  { code:'13A', name:'Dark Mild',                 category:'Brown British Beer',              og:[1.030,1.038], fg:[1.008,1.013], ibu:[10,25],  ebc:[35,79],  abv:[3.0,3.8] },
  { code:'13B', name:'British Brown Ale',         category:'Brown British Beer',              og:[1.040,1.052], fg:[1.008,1.013], ibu:[20,30],  ebc:[26,47],  abv:[4.2,5.4] },
  { code:'13C', name:'English Porter',            category:'Brown British Beer',              og:[1.040,1.052], fg:[1.008,1.014], ibu:[18,35],  ebc:[33,79],  abv:[4.0,5.4] },
  // 14. Scottish Ale
  { code:'14A', name:'Scottish Light',            category:'Scottish Ale',                    og:[1.030,1.035], fg:[1.010,1.013], ibu:[10,20],  ebc:[16,35],  abv:[2.5,3.2] },
  { code:'14B', name:'Scottish Heavy',            category:'Scottish Ale',                    og:[1.035,1.040], fg:[1.010,1.015], ibu:[10,25],  ebc:[16,35],  abv:[3.2,3.9] },
  { code:'14C', name:'Scottish Export',           category:'Scottish Ale',                    og:[1.040,1.060], fg:[1.010,1.016], ibu:[15,30],  ebc:[16,35],  abv:[3.9,6.0] },
  // 15. Irish Beer
  { code:'15A', name:'Irish Red Ale',             category:'Irish Beer',                      og:[1.036,1.046], fg:[1.010,1.014], ibu:[18,28],  ebc:[28,47],  abv:[3.8,5.0] },
  { code:'15B', name:'Irish Stout',               category:'Irish Beer',                      og:[1.036,1.044], fg:[1.007,1.011], ibu:[25,40],  ebc:[40,79],  abv:[4.0,4.5] },
  { code:'15C', name:'Irish Extra Stout',         category:'Irish Beer',                      og:[1.052,1.062], fg:[1.010,1.014], ibu:[35,50],  ebc:[79,140], abv:[5.5,6.5] },
  // 16. Dark British Beer
  { code:'16A', name:'Sweet Stout',               category:'Dark British Beer',               og:[1.044,1.060], fg:[1.012,1.024], ibu:[20,40],  ebc:[56,140], abv:[4.0,6.0] },
  { code:'16B', name:'Oatmeal Stout',             category:'Dark British Beer',               og:[1.045,1.065], fg:[1.010,1.018], ibu:[25,40],  ebc:[40,79],  abv:[4.2,5.9] },
  { code:'16C', name:'Tropical Stout',            category:'Dark British Beer',               og:[1.056,1.075], fg:[1.010,1.018], ibu:[30,50],  ebc:[56,79],  abv:[5.5,8.0] },
  { code:'16D', name:'Foreign Extra Stout',       category:'Dark British Beer',               og:[1.056,1.075], fg:[1.010,1.018], ibu:[25,50],  ebc:[56,79],  abv:[6.3,8.0] },
  // 17. Strong British Ale
  { code:'17A', name:'British Strong Ale',        category:'Strong British Ale',              og:[1.055,1.080], fg:[1.015,1.022], ibu:[30,60],  ebc:[24,44],  abv:[5.5,8.0] },
  { code:'17B', name:'Old Ale',                   category:'Strong British Ale',              og:[1.055,1.088], fg:[1.015,1.022], ibu:[30,60],  ebc:[24,79],  abv:[5.5,9.0] },
  { code:'17C', name:'Wee Heavy',                 category:'Strong British Ale',              og:[1.070,1.130], fg:[1.018,1.040], ibu:[17,35],  ebc:[24,79],  abv:[6.5,10.0] },
  { code:'17D', name:'English Barleywine',        category:'Strong British Ale',              og:[1.080,1.120], fg:[1.018,1.030], ibu:[35,70],  ebc:[20,59],  abv:[8.0,12.0] },
  // 18. Pale American Ale
  { code:'18A', name:'Blonde Ale',                category:'Pale American Ale',               og:[1.038,1.054], fg:[1.008,1.013], ibu:[15,28],  ebc:[4,10],   abv:[3.8,5.5] },
  { code:'18B', name:'American Pale Ale',         category:'Pale American Ale',               og:[1.045,1.060], fg:[1.010,1.015], ibu:[30,50],  ebc:[12,28],  abv:[5.0,6.0] },
  // 19. Amber and Brown American Beer
  { code:'19A', name:'American Amber Ale',        category:'Amber and Brown American Beer',   og:[1.045,1.060], fg:[1.010,1.015], ibu:[25,40],  ebc:[24,47],  abv:[4.5,6.2] },
  { code:'19B', name:'California Common',         category:'Amber and Brown American Beer',   og:[1.048,1.054], fg:[1.011,1.014], ibu:[30,45],  ebc:[16,24],  abv:[4.5,5.5] },
  { code:'19C', name:'American Brown Ale',        category:'Amber and Brown American Beer',   og:[1.045,1.060], fg:[1.010,1.016], ibu:[20,30],  ebc:[28,47],  abv:[4.3,6.2] },
  // 20. American Porter and Stout
  { code:'20A', name:'American Porter',           category:'American Porter and Stout',       og:[1.050,1.070], fg:[1.012,1.018], ibu:[25,50],  ebc:[35,79],  abv:[4.8,6.5] },
  { code:'20B', name:'American Stout',            category:'American Porter and Stout',       og:[1.050,1.075], fg:[1.010,1.022], ibu:[35,75],  ebc:[40,79],  abv:[5.0,7.0] },
  { code:'20C', name:'Imperial Stout',            category:'American Porter and Stout',       og:[1.075,1.115], fg:[1.018,1.030], ibu:[50,90],  ebc:[56,79],  abv:[8.0,12.0] },
  // 21. IPA
  { code:'21A', name:'American IPA',              category:'IPA',                             og:[1.056,1.070], fg:[1.008,1.014], ibu:[40,70],  ebc:[12,28],  abv:[5.5,7.5] },
  { code:'21B', name:'Specialty IPA',             category:'IPA',                             og:[1.056,1.070], fg:[1.008,1.014], ibu:[40,70],  ebc:[6,40],   abv:[5.5,9.0] },
  { code:'21C', name:'Hazy IPA',                  category:'IPA',                             og:[1.060,1.085], fg:[1.010,1.015], ibu:[25,60],  ebc:[5,14],   abv:[6.0,9.0] },
  // 22. Strong American Ale
  { code:'22A', name:'Double IPA',                category:'Strong American Ale',             og:[1.065,1.100], fg:[1.008,1.018], ibu:[60,120], ebc:[12,35],  abv:[7.5,10.0] },
  { code:'22B', name:'American Strong Ale',       category:'Strong American Ale',             og:[1.062,1.090], fg:[1.014,1.024], ibu:[50,100], ebc:[24,47],  abv:[6.3,10.0] },
  { code:'22C', name:'American Barleywine',       category:'Strong American Ale',             og:[1.080,1.120], fg:[1.016,1.030], ibu:[50,100], ebc:[24,47],  abv:[8.0,12.0] },
  { code:'22D', name:'Wheatwine',                 category:'Strong American Ale',             og:[1.080,1.120], fg:[1.016,1.030], ibu:[30,60],  ebc:[24,47],  abv:[8.0,12.0] },
  // 23. European Sour Ale
  { code:'23A', name:'Berliner Weisse',           category:'European Sour Ale',               og:[1.028,1.032], fg:[1.003,1.006], ibu:[3,8],    ebc:[2,4],    abv:[2.8,3.8] },
  { code:'23B', name:'Flanders Red Ale',          category:'European Sour Ale',               og:[1.048,1.057], fg:[1.002,1.012], ibu:[10,25],  ebc:[24,47],  abv:[4.6,6.5] },
  { code:'23C', name:'Oud Bruin',                 category:'European Sour Ale',               og:[1.040,1.074], fg:[1.008,1.012], ibu:[20,25],  ebc:[24,79],  abv:[4.0,8.0] },
  { code:'23D', name:'Lambic',                    category:'European Sour Ale',               og:[1.040,1.054], fg:[1.001,1.010], ibu:[0,10],   ebc:[4,14],   abv:[5.0,6.5] },
  { code:'23E', name:'Gueuze',                    category:'European Sour Ale',               og:[1.040,1.060], fg:[1.000,1.006], ibu:[0,10],   ebc:[4,14],   abv:[5.0,8.0] },
  { code:'23F', name:'Fruit Lambic',              category:'European Sour Ale',               og:[1.040,1.060], fg:[1.000,1.010], ibu:[0,10],   ebc:[4,14],   abv:[5.0,7.0] },
  { code:'23G', name:'Gose',                      category:'European Sour Ale',               og:[1.036,1.056], fg:[1.006,1.010], ibu:[5,12],   ebc:[4,9],    abv:[4.2,4.8] },
  // 24. Belgian Ale
  { code:'24A', name:'Witbier',                   category:'Belgian Ale',                     og:[1.044,1.052], fg:[1.008,1.012], ibu:[8,20],   ebc:[4,8],    abv:[4.5,5.5] },
  { code:'24B', name:'Belgian Pale Ale',          category:'Belgian Ale',                     og:[1.048,1.054], fg:[1.010,1.014], ibu:[20,30],  ebc:[14,28],  abv:[4.8,5.5] },
  { code:'24C', name:'Bière de Garde',            category:'Belgian Ale',                     og:[1.060,1.080], fg:[1.008,1.016], ibu:[18,28],  ebc:[12,28],  abv:[6.0,8.5] },
  // 25. Strong Belgian Ale
  { code:'25A', name:'Belgian Blond Ale',         category:'Strong Belgian Ale',              og:[1.062,1.075], fg:[1.008,1.018], ibu:[15,30],  ebc:[4,12],   abv:[6.0,7.5] },
  { code:'25B', name:'Saison',                    category:'Strong Belgian Ale',              og:[1.048,1.065], fg:[1.002,1.008], ibu:[20,35],  ebc:[5,22],   abv:[3.5,9.0] },
  { code:'25C', name:'Belgian Golden Strong Ale', category:'Strong Belgian Ale',              og:[1.070,1.095], fg:[1.005,1.016], ibu:[22,35],  ebc:[4,7],    abv:[7.5,10.5] },
  // 26. Trappist Ale
  { code:'26A', name:'Trappist Single',           category:'Trappist Ale',                    og:[1.044,1.054], fg:[1.004,1.010], ibu:[25,45],  ebc:[4,10],   abv:[4.8,6.0] },
  { code:'26B', name:'Belgian Dubbel',            category:'Trappist Ale',                    og:[1.062,1.075], fg:[1.008,1.018], ibu:[15,25],  ebc:[28,47],  abv:[6.0,7.6] },
  { code:'26C', name:'Belgian Tripel',            category:'Trappist Ale',                    og:[1.075,1.085], fg:[1.008,1.014], ibu:[20,40],  ebc:[7,14],   abv:[7.5,9.5] },
  { code:'26D', name:'Belgian Dark Strong Ale',   category:'Trappist Ale',                    og:[1.075,1.110], fg:[1.010,1.024], ibu:[20,35],  ebc:[28,79],  abv:[8.0,12.0] },
  // 27. Historical Beer
  { code:'27A', name:'Historical Beer',           category:'Historical Beer',                 og:[1.040,1.090], fg:[1.008,1.020], ibu:[20,70],  ebc:[8,70],   abv:[4.0,10.0] },
  // 28. American Wild Ale
  { code:'28A', name:'Brett Beer',                category:'American Wild Ale',               og:[1.045,1.072], fg:[1.004,1.012], ibu:[5,40],   ebc:[4,33],   abv:[4.0,8.0] },
  { code:'28B', name:'Mixed-Fermentation Sour Beer', category:'American Wild Ale',            og:[1.045,1.072], fg:[1.000,1.010], ibu:[5,40],   ebc:[4,40],   abv:[4.0,8.0] },
  { code:'28C', name:'Wild Specialty Beer',       category:'American Wild Ale',               og:[1.045,1.072], fg:[1.000,1.014], ibu:[5,40],   ebc:[4,40],   abv:[4.0,8.0] },
  // 29. Fruit Beer
  { code:'29A', name:'Fruit Beer',                category:'Fruit Beer',                      og:[1.040,1.110], fg:[1.006,1.020], ibu:[5,70],   ebc:[4,79],   abv:[4.0,10.0] },
  { code:'29B', name:'Fruit and Spice Beer',      category:'Fruit Beer',                      og:[1.040,1.110], fg:[1.006,1.020], ibu:[5,70],   ebc:[4,79],   abv:[4.0,10.0] },
  { code:'29C', name:'Specialty Fruit Beer',      category:'Fruit Beer',                      og:[1.040,1.110], fg:[1.006,1.020], ibu:[5,70],   ebc:[4,79],   abv:[4.0,10.0] },
  // 30. Spiced Beer
  { code:'30A', name:'Spice, Herb, or Vegetable Beer', category:'Spiced Beer',               og:[1.040,1.110], fg:[1.006,1.030], ibu:[5,70],   ebc:[4,79],   abv:[4.0,10.0] },
  { code:'30B', name:'Autumn Seasonal Beer',      category:'Spiced Beer',                     og:[1.055,1.075], fg:[1.012,1.016], ibu:[20,40],  ebc:[24,47],  abv:[5.0,7.5] },
  { code:'30C', name:'Winter Seasonal Beer',      category:'Spiced Beer',                     og:[1.055,1.100], fg:[1.012,1.024], ibu:[15,35],  ebc:[28,79],  abv:[5.0,9.0] },
  { code:'30D', name:'Specialty Spice Beer',      category:'Spiced Beer',                     og:[1.040,1.110], fg:[1.006,1.030], ibu:[5,70],   ebc:[4,79],   abv:[4.0,10.0] },
  // 31. Alternative Fermentables Beer
  { code:'31A', name:'Alternative Grain Beer',    category:'Alternative Fermentables Beer',   og:[1.040,1.070], fg:[1.008,1.018], ibu:[15,50],  ebc:[4,47],   abv:[4.0,7.0] },
  { code:'31B', name:'Alternative Sugar Beer',    category:'Alternative Fermentables Beer',   og:[1.040,1.110], fg:[1.006,1.024], ibu:[5,70],   ebc:[4,79],   abv:[4.0,10.0] },
  // 32. Smoked Beer
  { code:'32A', name:'Classic Style Smoked Beer', category:'Smoked Beer',                     og:[1.040,1.090], fg:[1.010,1.022], ibu:[20,60],  ebc:[14,47],  abv:[4.0,9.0] },
  { code:'32B', name:'Specialty Smoked Beer',     category:'Smoked Beer',                     og:[1.040,1.110], fg:[1.006,1.030], ibu:[5,70],   ebc:[4,79],   abv:[4.0,10.0] },
  // 33. Wood-Aged Beer
  { code:'33A', name:'Wood-Aged Beer',            category:'Wood-Aged Beer',                  og:[1.040,1.120], fg:[1.006,1.030], ibu:[5,100],  ebc:[4,79],   abv:[4.0,13.0] },
  { code:'33B', name:'Specialty Wood-Aged Beer',  category:'Wood-Aged Beer',                  og:[1.040,1.120], fg:[1.006,1.030], ibu:[5,100],  ebc:[4,79],   abv:[4.0,13.0] },
  // 34. Specialty Beer
  { code:'34A', name:'Commercial Specialty Beer', category:'Specialty Beer',                  og:[1.040,1.110], fg:[1.006,1.030], ibu:[5,100],  ebc:[4,79],   abv:[4.0,12.0] },
  { code:'34B', name:'Mixed-Style Beer',          category:'Specialty Beer',                  og:[1.040,1.110], fg:[1.006,1.030], ibu:[5,100],  ebc:[4,79],   abv:[4.0,12.0] },
  { code:'34C', name:'Experimental Beer',         category:'Specialty Beer',                  og:[1.040,1.110], fg:[1.006,1.030], ibu:[5,100],  ebc:[4,79],   abv:[4.0,12.0] },
];

// Grouped by category for optgroup rendering
export function getBjcpGroups() {
  const groups = {};
  for (const s of BJCP_STYLES) {
    if (!groups[s.category]) groups[s.category] = [];
    groups[s.category].push(s);
  }
  return groups;
}

// Find style by code
export function findStyle(code) {
  return BJCP_STYLES.find(s => s.code === code);
}

// SG <-> Brix conversions
export function sgToBrix(sg) {
  const sg_n = parseFloat(sg);
  if (!sg_n || sg_n < 1) return '';
  // Accurate formula for wort
  const brix = 135.997 * Math.pow(sg_n, 3) - 630.272 * Math.pow(sg_n, 2) + 1111.14 * sg_n - 616.868;
  return Math.round(brix * 10) / 10;
}

export function brixToSg(brix) {
  const b = parseFloat(brix);
  if (!b && b !== 0) return '';
  const sg = 1 + (b / (258.6 - ((b / 258.2) * 227.1)));
  return Math.round(sg * 10000) / 10000;
}

// Standard mash rest templates
export const MASH_PRESETS = {
  single: {
    label: 'Одна пауза (Single Infusion)',
    rests: [
      { name: 'Затирание',    temp_c: '66', duration_min: '60', rest_type: 'saccharification' },
      { name: 'Мэш-аут',     temp_c: '78', duration_min: '10', rest_type: 'mash_out' },
    ],
  },
  step: {
    label: 'Ступенчатый (Step Mash)',
    rests: [
      { name: 'Белковая пауза',         temp_c: '52', duration_min: '15', rest_type: 'protein' },
      { name: 'Мальтозная пауза (β)',   temp_c: '63', duration_min: '40', rest_type: 'beta_amylase' },
      { name: 'Декстринизация (α)',      temp_c: '72', duration_min: '20', rest_type: 'alpha_amylase' },
      { name: 'Мэш-аут',               temp_c: '78', duration_min: '10', rest_type: 'mash_out' },
    ],
  },
  full: {
    label: 'Все паузы (Full Profile)',
    rests: [
      { name: 'Кислотная пауза',        temp_c: '40', duration_min: '15', rest_type: 'acid' },
      { name: 'Белковая пауза',         temp_c: '52', duration_min: '15', rest_type: 'protein' },
      { name: 'Мальтозная пауза (β)',   temp_c: '63', duration_min: '45', rest_type: 'beta_amylase' },
      { name: 'Декстринизация (α)',      temp_c: '72', duration_min: '20', rest_type: 'alpha_amylase' },
      { name: 'Мэш-аут',               temp_c: '78', duration_min: '10', rest_type: 'mash_out' },
    ],
  },
  decoction: {
    label: 'Декокция (Double Decoction)',
    rests: [
      { name: 'Затирание (первое)',      temp_c: '52', duration_min: '30', rest_type: 'protein' },
      { name: 'Декокция → нагрев',       temp_c: '63', duration_min: '20', rest_type: 'beta_amylase' },
      { name: 'Декокция → кипячение',    temp_c: '100', duration_min: '15', rest_type: 'decoction' },
      { name: 'Смешивание (α-пауза)',    temp_c: '70', duration_min: '20', rest_type: 'alpha_amylase' },
      { name: 'Мэш-аут',               temp_c: '78', duration_min: '10', rest_type: 'mash_out' },
    ],
  },
};
