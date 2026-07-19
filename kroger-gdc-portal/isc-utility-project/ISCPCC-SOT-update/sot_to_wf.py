import os
import sys
import shutil
import subprocess
import pandas as pd
import logging
import time
from git import Repo, GitCommandError
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv
load_dotenv()

#logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
 
# --- CONFIGURATION ---
REPO_DIR = "./gdce-acm"
REPO_URL = "git@github.com:kroger.com/gdce-acm.git"

REPO_CSV_PATH = os.path.join(REPO_DIR, "iscpcc", "source_of_truth.csv")
TARGET_BRANCH = "lab"

#APP_CSV_PATH = "/iscpcc/source_of_truth.csv"

DB_CONNECT_STR =os.getenv("DB_CONN")
DB_QUERY = os.getenv("DB_QUERY","sot_table")

REQUIRED_COLUMNS = {"cluster_name"}

MAX_RETRIES = 3
RETRY_DELAY = 5  


if not REPO_URL or not DB_CONNECT_STR or not DB_QUERY :
    logging.critical("missing required env var/ credentials")
    sys.exit(1)

#retry wrapper

def retry(func):
    def wrapper(*args, **kwargs):
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                logging.warning(f"{func.__name__} failed (attempt {attempt}/{MAX_RETRIES}): {e}")
                if attempt == MAX_RETRIES:
                    raise
                time.sleep(RETRY_DELAY)
    return wrapper


def validate_dataframe(df: pd.DataFrame):
    if df.empty:
        raise ValueError("Dataframe is empty")

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    if df["cluster_name"].isnull().any():
        raise ValueError("Null values found in 'cluster_name'")

@retry
def fetch_data_iscpcc_sot():
    logging.info("fetching sot from app")

    try:
        engine = create_engine(DB_CONNECT_STR)
        with engine.connect() as conn:
            df = pd.read_sql(DB_QUERY, conn)

        logging.info(f"DB rows fetched: {len(df)}")
        validate_dataframe(df)
        return df
    except SQLAlchemyError as e:
        logging.error(f"failed to fetch data from db: {e}")
        raise



# def normalize_df(df: pd.DataFrame):
#     df = df.copy()
#     df = df.sort_values(by="cluster_name").reset_index(drop=True)
#     df = df.fillna("")  # reduce NaN noise
#     return df

def db_to_wf():

    #fetch db to check valid
    try:
        #app_df = pd.read_csv(APP_CSV_PATH).sort_values(by="cluster_name").reset_index(drop=True)
        app_df = fetch_data_iscpcc_sot()
        app_df = app_df.sort_values(by="cluster_name").reset_index(drop=True)
    
        
    except Exception as e:
        logging.error(f"failed: {e}")
        sys.exit(1)
 
if __name__ == "__main__":
    db_to_wf()