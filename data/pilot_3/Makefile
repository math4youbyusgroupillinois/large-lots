VPATH=raw:build
include config.mk
county_shp=$(notdir $(shell ls raw/cook-county/*.shp))

LAND_HEADER = "pin14,street_number,dir,street_name,type,sq_ft,ward,community_area,zoning_classification,tif_district"

clean:
	@rm -Rf build

land-inventory.csv:
	@wget https://data.cityofchicago.org/api/views/aksk-kvfp/rows.csv?accessType=DOWNLOAD -qO- | \
		python processors/remove_dashes.py 0 | \
		(echo $(LAND_HEADER) ; tail -n +2) > build/$@

cook-county-parcels.zip:
	@wget "https://datacatalog.cookcountyil.gov/api/geospatial/e62c-6rz8?method=export&format=Shapefile" -O raw/$@

land-inventory.table: land-inventory.csv
	@psql -h $(PG_HOST) -U $(PG_USER) -p $(PG_PORT) -d $(PG_DB) -c "DROP TABLE IF EXISTS land_inventory;"
	@csvsql build/land-inventory.csv \
			--db "postgresql://$(PG_USER):@$(PG_HOST):$(PG_PORT)/$(PG_DB)" --table land_inventory --insert
	@touch build/land-inventory.table

cook-county-parcels.table: cook-county-parcels.zip
	@mkdir -p raw/cook-county
	@unzip -d raw/cook-county raw/cook-county-parcels.zip
	@ogr2ogr -overwrite -t_srs EPSG:4326 build/$(county_shp) raw/cook-county/$(county_shp)
	@shp2pgsql -I -s 4326 -d build/$(county_shp) cook_county_parcels | \
		psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT)
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"CREATE INDEX county_pin_idx ON cook_county_parcels (PIN14)"
	@touch build/cook-county-parcels.table

community-areas.zip: 
	@wget "https://data.cityofchicago.org/api/geospatial/cauq-8yn6?method=export&format=Original" -O raw/$@

ca_shp=$(notdir $(shell ls raw/community-areas/*.shp))

community-areas.table: community-areas.zip
	@mkdir -p raw/community-areas
	@unzip -d raw/community-areas -f raw/community-areas.zip
	@ogr2ogr -overwrite -t_srs EPSG:4326 build/$(ca_shp) raw/community-areas/$(ca_shp)
	@psql -h $(PG_HOST) -U $(PG_USER) -p $(PG_PORT) -d $(PG_DB) -c \
		"DROP TABLE IF EXISTS community_areas;"
	@shp2pgsql -I -s 4326 -d build/$(ca_shp) community_areas | \
		psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT)
	@touch build/community-areas.table

land-inventory-parcels.shp: cook-county-parcels.table land-inventory.table
	@pgsql2shp -f build/land-inventory-parcels.shp -h $(PG_HOST) -u $(PG_USER) -p $(PG_PORT) $(PG_DB) \
		"SELECT cook_county_parcels.geom, land_inventory.* \
			FROM cook_county_parcels \
			JOIN land_inventory ON cast(cook_county_parcels.PIN14 as bigint) = land_inventory.pin14"

city-owned-residential-lots.table: land-inventory.table cook-county-parcels.table
	@psql -h $(PG_HOST) -U $(PG_USER) -p $(PG_PORT) -d $(PG_DB) -c "DROP TABLE IF EXISTS city_owned_residential_lots;"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"CREATE TABLE city_owned_residential_lots AS \
			SELECT cook_county_parcels.geom, land_inventory.* \
			FROM cook_county_parcels \
			JOIN land_inventory \
			ON cast(cook_county_parcels.PIN14 as bigint) = land_inventory.pin14 \
			WHERE zoning_classification LIKE 'R%' \
				OR zoning_classification IS NULL"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"ALTER TABLE city_owned_residential_lots ADD COLUMN city_owned boolean"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"ALTER TABLE city_owned_residential_lots ADD COLUMN residential boolean"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"ALTER TABLE city_owned_residential_lots ADD COLUMN alderman_hold boolean"
	@touch build/$@

AUSTIN_HEADER = "pin14,street_number,dir,street_name,type,ward,zoning_classification"

eligable_lots.csv: CityOwned_R_Austin_byWard_Completed_LIS_Check.xls
	@in2csv raw/CityOwned_R_Austin_byWard_Completed_LIS_Check.xls | \
		python processors/remove_dashes.py 0 | \
		csvcut -c 1,2,3,4,5,7,8 | \
		(echo $(AUSTIN_HEADER) ; tail -n +2) > build/$@

eligable_lots.table: eligable_lots.csv
	@psql -h $(PG_HOST) -U $(PG_USER) -p $(PG_PORT) -d $(PG_DB) -c "DROP TABLE IF EXISTS eligable_lots;"
	@csvsql build/eligable_lots.csv \
			--db "postgresql://$(PG_USER):@$(PG_HOST):$(PG_PORT)/$(PG_DB)" --table eligable_lots --insert
	@touch build/eligable_lots.table

austin_lots.table: community-areas.table cook-county-parcels.table
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"DROP TABLE IF EXISTS austin_lots"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"CREATE TABLE austin_lots AS \
			SELECT \
				CAST(p.pin14 AS bigint) as display_pin, \
				CAST(p.pin14 AS bigint) as pin14, \
				CAST(p.shape_area as int) as sq_ft, \
				'AUSTIN' as community_area, \
				FALSE as eligable, \
				FALSE as city_owned, \
				FALSE as residential, \
				FALSE as alderman_hold, \
				p.geom as geom, \
				ST_X(ST_Centroid(p.geom)) as longitude, \
				ST_Y(ST_Centroid(p.geom)) as latitude, \
				0 as status \
			FROM cook_county_parcels AS p \
			JOIN community_areas as c \
				ON ST_Within(p.geom, c.geom) \
			WHERE c.community = 'AUSTIN'"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"ALTER TABLE austin_lots ADD COLUMN street_number int"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"ALTER TABLE austin_lots ADD COLUMN dir varchar"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"ALTER TABLE austin_lots ADD COLUMN street_name varchar"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"ALTER TABLE austin_lots ADD COLUMN type varchar"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"ALTER TABLE austin_lots ADD COLUMN ward varchar"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"ALTER TABLE austin_lots ADD COLUMN zoning_classification varchar"
	@touch build/austin_lots.table

austin_lots.defaults: austin_lots.table
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"UPDATE austin_lots SET \
			street_number=s.street_number, \
			dir=s.dir, \
			street_name=s.street_name, \
			type=s.type, \
			ward=s.ward, \
			zoning_classification=s.zoning_classification, \
			eligable=TRUE, \
			city_owned=TRUE, \
			residential=TRUE, \
			status=0 FROM ( \
				SELECT \
					COALESCE(l.pin14, e.pin14) as pin14, \
					COALESCE(l.street_number, e.street_number) as street_number, \
					COALESCE(l.dir, e.dir) as dir, \
					COALESCE(l.street_name, e.street_name) as street_name, \
					COALESCE(l.type, e.type) as type, \
					COALESCE(l.ward, e.ward) as ward, \
					COALESCE(l.zoning_classification, e.zoning_classification) as zoning_classification \
				FROM eligable_lots AS e \
				LEFT JOIN city_owned_residential_lots AS l \
					ON e.pin14 = l.pin14 \
			) as s \
			WHERE austin_lots.pin14 = s.pin14"
	@touch build/austin_lots.defaults

austin_lots.updates: austin_lots.defaults
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"INSERT INTO austin_lots ( \
				display_pin, \
				street_number, \
				dir, \
				street_name, \
				type, \
				ward, \
				zoning_classification, \
				community_area, \
				eligable, \
				city_owned, \
				residential, \
				alderman_hold, \
				status ) VALUES ( \
					16161150470000, \
					5300, \
					'W', \
					'VAN BUREN', \
					'ST', \
					29, \
					'RS-3', \
					'AUSTIN', \
					TRUE, \
					TRUE, \
					TRUE, \
					FALSE, \
					0 \
				)"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"UPDATE austin_lots SET geom=subq.geom FROM ( \
				SELECT \
					ST_Multi(ST_Union(p.geom)) as geom \
				FROM cook_county_parcels as p \
				WHERE p.PIN14 IN ('16161150790000','16161150800000') \
			) AS subq \
			WHERE austin_lots.display_pin=16161150470000"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"INSERT INTO austin_lots ( \
				display_pin, \
				street_number, \
				dir, \
				street_name, \
				type, \
				ward, \
				zoning_classification, \
				community_area, \
				eligable, \
				city_owned, \
				residential, \
				alderman_hold, \
				status) VALUES ( \
					16094230010000, \
					4955, \
					'W', \
					'WEST END', \
					'AVE', \
					28, \
					'RT-4', \
					'AUSTIN', \
					TRUE, \
					TRUE, \
					TRUE, \
					FALSE, \
					0 \
				)"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"UPDATE austin_lots SET geom=subq.geom FROM ( \
				SELECT \
					ST_Multi(ST_Union(p.geom)) as geom \
				FROM cook_county_parcels as p \
				WHERE p.PIN14 IN ('16094230360000','16094230370000') \
			) AS subq \
			WHERE austin_lots.display_pin=16094230010000"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"INSERT INTO austin_lots ( \
				display_pin, \
				street_number, \
				dir, \
				street_name, \
				type, \
				ward, \
				zoning_classification, \
				community_area, \
				eligable, \
				city_owned, \
				residential, \
				alderman_hold, \
				status ) VALUES ( \
					16084150481001, \
					134, \
					'N', \
					'WALLER', \
					'AVE', \
					29, \
					'RT-4', \
					'AUSTIN', \
					TRUE, \
					TRUE, \
					TRUE, \
					FALSE, \
					0 \
				)"
	@psql -d $(PG_DB) -U $(PG_USER) -h $(PG_HOST) -p $(PG_PORT) -c \
		"UPDATE austin_lots SET geom=subq.geom FROM ( \
				SELECT \
					p.geom as geom \
				FROM cook_county_parcels as p \
				WHERE p.PIN14 = '16084150480000' \
			) AS subq \
			WHERE austin_lots.display_pin=16084150481001"
	@touch build/austin_lots.updates

austin_lots.shp: austin_lots.updates
	@pgsql2shp -f finished/austin_lots.shp -h $(PG_HOST) -u $(PG_USER) -p $(PG_PORT) $(PG_DB) austin_lots

austin_lots.zip: austin_lots.shp
	@ls finished/austin_lots.* | zip finished/austin_lots.zip -@ 
