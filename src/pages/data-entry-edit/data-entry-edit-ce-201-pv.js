import React, {Component, useEffect, useState} from "react";
import Moment from 'moment';

import {
    getElections, getPollingStations,
    getTallySheet,
    getTallySheetById,
    getTallySheetVersionById,
    saveTallySheetVersion, submitTallySheet
} from "../../services/tabulation-api";
import {MessagesProvider, MessagesConsumer, MESSAGE_TYPES} from "../../services/messages.provider";
import {
    PATH_ELECTION, PATH_ELECTION_BY_ID,
    PATH_ELECTION_DATA_ENTRY, PATH_ELECTION_DATA_ENTRY_EDIT,
    TALLY_SHEET_CODE_CE_201,
    TALLY_SHEET_CODE_CE_201_PV,
    TALLY_SHEET_CODE_PRE_41
} from "../../App";
import BreadCrumb from "../../components/bread-crumb";
import Processing from "../../components/processing";
import Error from "../../components/error";
import Table from "@material-ui/core/Table";
import TableHead from "@material-ui/core/TableHead";
import TableFooter from "@material-ui/core/TableFooter";
import TableRow from "@material-ui/core/TableRow";
import TableCell from "@material-ui/core/TableCell";
import TableBody from "@material-ui/core/TableBody";
import TextField from '@material-ui/core/TextField';

import Button from '@material-ui/core/Button';
import {isNumeric, processNumericValue} from "../../utils";
import {MESSAGES_EN} from "../../locale/messages_en";

export default function DataEntryEdit_CE_201_PV({history, queryString, election, tallySheet, messages}) {
    const {tallySheetId, tallySheetCode} = tallySheet;
    const {electionId, electionName} = election;

    const [countingCentreSummary, setCountingCentreSummary] = useState({
        numberOfACoversRejected: 0,
        numberOfBCoversRejected: 0,
        numberOfValidBallotPapers: 0,
        situation: "",
        timeOfCommencementOfCount: "",
    });
    const [ballotBoxList, setBallotBoxList] = useState([]);
    const [ballotBoxMap, setBallotBoxMap] = useState({});
    const [processing, setProcessing] = useState(true);
    const [tallySheetVersion, setTallySheetVersion] = useState(null);
    const [processingLabel, setProcessingLabel] = useState("Loading");
    const [saved, setSaved] = useState(false);
    const [totalNumberOfPVPackets, setTotalNumberOfPVPackets] = useState(0);

    const addBallotBox = ballotBox => {
        let {refId, ballotBoxId, numberOfAPacketsFound, numberOfPacketsInserted} = ballotBox;
        if (!ballotBoxId) {
            ballotBoxId = ""
        }

        if (!numberOfAPacketsFound) {
            numberOfAPacketsFound = 0;
        }

        if (!numberOfPacketsInserted) {
            numberOfPacketsInserted = 0;
        }

        setBallotBoxMap((ballotBoxMap) => {
            return {
                ...ballotBoxMap,
                [refId]: {
                    refId, ballotBoxId, numberOfAPacketsFound, numberOfPacketsInserted
                }
            }
        });
        setBallotBoxList(ballotBoxList => [...ballotBoxList, refId]);
    };

    const fetchData = async () => {
        try {
            if (tallySheet.latestVersionId) {
                const latestVersion = await getTallySheetVersionById(tallySheetId, tallySheetCode, tallySheet.latestVersionId);
                const {content, summary} = latestVersion;
                let totalPV = 0;
                for (let i = 0; i < content.length; i++) {
                    let ballotBox = content[i];
                    ballotBox.refId = i;
                    totalPV += ballotBox.numberOfAPacketsFound;
                    addBallotBox(ballotBox);
                }
                for (let i = content.length; i < 6; i++) {
                    addBallotBox({refId: i});
                }

                console.log(latestVersion);
                setTotalNumberOfPVPackets(totalPV);
                // TODO: temporary fix for timezone issues, once the api does the timezone conversion right this can be resolved
                summary["timeOfCommencementOfCount"] = Moment(summary.timeOfCommencementOfCount).format('YYYY-MM-DDThh:mm:00+11:00');
                setCountingCentreSummary({...summary});
                console.log(summary);

            } else {
                for (let i = 0; i < 6; i++) {
                    addBallotBox({refId: i});
                }
            }
        } catch (error) {
            messages.push("Error", MESSAGES_EN.error_tallysheet_not_reachable, MESSAGE_TYPES.ERROR);
        }

        setProcessing(false);
    };

    useEffect(() => {
        fetchData()
    }, []);


    const getTallySheetSaveRequestBody = () => {
        const content = [];
        let timeOfCommencement = countingCentreSummary.timeOfCommencementOfCount;
        if (!timeOfCommencement.includes("+")) {
            timeOfCommencement = countingCentreSummary.timeOfCommencementOfCount + ":00+05:30";
        }
        countingCentreSummary.timeOfCommencementOfCount = timeOfCommencement;
        const summary = countingCentreSummary;

        ballotBoxList.map(ballotBoxRefId => {
            const ballotBox = ballotBoxMap[ballotBoxRefId];
            let {ballotBoxId, numberOfAPacketsFound, numberOfPacketsInserted} = ballotBox;
            content.push({ballotBoxId, numberOfAPacketsFound, numberOfPacketsInserted});
        });

        return {
            content: content,
            summary: summary
        };
    };

    const handleClickNext = (saved = true) => async (event) => {
        if (validateAllValues()) {
            setSaved(saved)
            setProcessing(true);
            setProcessingLabel("Saving");
            try {
                const body = getTallySheetSaveRequestBody();
                const tallySheetVersion = await saveTallySheetVersion(tallySheetId, tallySheetCode, body);

                setTallySheetVersion(tallySheetVersion);
            } catch (e) {
                messages.push("Error", MESSAGES_EN.error_tallysheet_save, MESSAGE_TYPES.ERROR);
            }
            setProcessing(false);
        } else {
            messages.push("Error", MESSAGES_EN.error_input, MESSAGE_TYPES.ERROR)
        }
    };

    const handleClickSubmit = () => async (event) => {
        setProcessing(true);
        setProcessingLabel("Submitting");
        try {
            const {tallySheetVersionId} = tallySheetVersion;
            const tallySheet = await submitTallySheet(tallySheetId, tallySheetVersionId);

            messages.push("Success", MESSAGES_EN.success_pre41_submit, MESSAGE_TYPES.SUCCESS);
            setTimeout(() => {
                const subElectionId = tallySheet.electionId;
                history.push(PATH_ELECTION_DATA_ENTRY(electionId, tallySheetCode, subElectionId));
            }, 1000)
        } catch (e) {
            messages.push("Error", MESSAGES_EN.error_tallysheet_submit, MESSAGE_TYPES.ERROR);
        }

        setProcessing(false);
    };

    function validateAllValues() {
        for (let key in ballotBoxMap) {
            if (!isNumeric(ballotBoxMap[key]["numberOfPacketsInserted"])) {
                return false;
            }
            if (!isNumeric(ballotBoxMap[key]["numberOfAPacketsFound"])) {
                return false;
            }
        }
        return (calculateTotalNumberOfPVPackets() === totalNumberOfPVPackets)
    }

    const handleBallotBoxIdChange = ballotBoxRefId => event => {
        setBallotBoxMap({
            ...ballotBoxMap,
            [ballotBoxRefId]: {
                ...ballotBoxMap[ballotBoxRefId],
                ballotBoxId: event.target.value
            }
        })
    };

    const handleNumberOfPacketsInsertedChange = ballotBoxRefId => event => {
        setBallotBoxMap({
            ...ballotBoxMap,
            [ballotBoxRefId]: {
                ...ballotBoxMap[ballotBoxRefId],
                numberOfPacketsInserted: processNumericValue(event.target.value)
            }
        })
    };

    const handleNumberOfAPacketsFoundChange = ballotBoxRefId => event => {
        console.log()
        setBallotBoxMap({
            ...ballotBoxMap,
            [ballotBoxRefId]: {
                ...ballotBoxMap[ballotBoxRefId],
                numberOfAPacketsFound: processNumericValue(event.target.value)
            }
        })
    };

    const handleTotalNumberOfPVPacketsChange = () => event => {
        setTotalNumberOfPVPackets(processNumericValue(event.target.value));
    };

    const handleNumberOfACoversRejectedChange = () => event => {
        setCountingCentreSummary({
            ...countingCentreSummary,
            numberOfACoversRejected: processNumericValue(event.target.value)
        });
    };

    const handleNumberOfBCoversRejectedChange = () => event => {
        setCountingCentreSummary({
            ...countingCentreSummary,
            numberOfBCoversRejected: processNumericValue(event.target.value)
        });
    };

    const handleNumberOfValidBallotPapersChange = () => event => {
        setCountingCentreSummary({
            ...countingCentreSummary,
            numberOfValidBallotPapers: processNumericValue(event.target.value)
        });
    };

    const handleSituationChange = () => event => {
        setCountingCentreSummary({
            ...countingCentreSummary,
            situation: processNumericValue(event.target.value)
        });
    };

    const handleTimeOfCommencementOfCountChange = () => event => {
        console.log(event.target.value);
        setCountingCentreSummary({
            ...countingCentreSummary,
            timeOfCommencementOfCount: event.target.value
        });
    };

    function calculateTotalNumberOfPVPackets() {
        let total = 0;
        for (let key in ballotBoxMap) {
            total += parseInt(ballotBoxMap[key]["numberOfAPacketsFound"])
        }
        console.log(total);
        return total;
    }


    function getTallySheetEditForm() {
        if (saved) {
            const {numberOfACoversRejected, numberOfBCoversRejected, numberOfValidBallotPapers, situation, timeOfCommencementOfCount} = countingCentreSummary;
            return <Table aria-label="simple table" size={saved ? "small" : "medium"}>
                <TableHead>
                    <TableRow>
                        <TableCell align="center">Serial Number of Postal Votes Ballot Box</TableCell>
                        <TableCell align="center">No. of packets inserted by the Returning Officer</TableCell>
                        <TableCell align="center">No. pf PV-A packets found inside the Ballot Box after the
                            count</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {ballotBoxList.map(ballotBoxRefId => {
                        const ballotBox = ballotBoxMap[ballotBoxRefId];
                        let {ballotBoxId, numberOfAPacketsFound, numberOfPacketsInserted} = ballotBox;
                        return <TableRow key={ballotBoxRefId}>
                            <TableCell align="center">{ballotBoxId}</TableCell>
                            <TableCell align="center">{numberOfPacketsInserted}</TableCell>
                            <TableCell align="center">{numberOfAPacketsFound}</TableCell>
                        </TableRow>
                    })}
                </TableBody>

                <TableFooter>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            Total number of PV-A packets found in the Box/ Boxes
                        </TableCell>
                        <TableCell align="right">
                            {totalNumberOfPVPackets}
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            Number of Packets rejected on various grounds after opening 'A' covers
                        </TableCell>
                        <TableCell align="right">
                            {numberOfACoversRejected}
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            <strong>No. of covers rejected on</strong>
                            various grounds after opening 'B' covers in accepted ballot papers receptacle
                        </TableCell>
                        <TableCell align="right">
                            {numberOfBCoversRejected}
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            <strong>
                                No of postal ballot papers for the count in the receptacle for accepted ballot papers.
                            </strong>
                        </TableCell>
                        <TableCell align="right">
                            {numberOfValidBallotPapers}
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            <strong>
                                Location of Postal Ballot Paper Counting Centre
                            </strong>
                        </TableCell>
                        <TableCell align="right">
                            {situation}
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            <strong>
                                Time of commencement of the count of Postal Votes ballot papers
                            </strong>
                        </TableCell>
                        <TableCell align="right">
                            {Moment(timeOfCommencementOfCount).format('DD-MM-YYYY h:mm A')}
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={3}>
                            <div className="page-bottom-fixed-action-bar">
                                <Button variant="contained" color="default" onClick={handleClickNext(false)}>
                                    Edit
                                </Button>
                                <Button variant="contained" color="primary" onClick={handleClickSubmit()}>
                                    Submit
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>

                </TableFooter>

            </Table>
        } else if (!processing) {
            const {numberOfACoversRejected, numberOfBCoversRejected, numberOfValidBallotPapers, situation, timeOfCommencementOfCount} = countingCentreSummary;
            return <Table aria-label="simple table" size="medium">
                <TableHead>
                    <TableRow>
                        <TableCell align="center">Serial Number of Postal Votes Ballot Box</TableCell>
                        <TableCell align="center">No. of packets inserted by the Returning Officer</TableCell>
                        <TableCell align="center">No. pf PV-A packets found inside the Ballot Box after the
                            count</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {ballotBoxList.map(ballotBoxRefId => {
                        const ballotBox = ballotBoxMap[ballotBoxRefId];
                        let {ballotBoxId, numberOfAPacketsFound, numberOfPacketsInserted} = ballotBox;
                        return <TableRow key={ballotBoxRefId}>
                            <TableCell align="center">
                                <TextField
                                    variant="outlined"
                                    value={ballotBoxId}
                                    margin="normal"
                                    onChange={handleBallotBoxIdChange(ballotBoxRefId)}
                                    inputProps={{
                                        style: {
                                          height: '10px'
                                        },
                                    }}
                                />
                            </TableCell>
                            <TableCell align="center">
                                <TextField
                                    required
                                    variant="outlined"
                                    error={!isNumeric(numberOfPacketsInserted)}
                                    helperText={!isNumeric(numberOfPacketsInserted) ? "Only numeric values are valid" : ''}
                                    value={numberOfPacketsInserted}
                                    margin="normal"
                                    onChange={handleNumberOfPacketsInsertedChange(ballotBoxRefId)}
                                    inputProps={{
                                        style: {
                                          height: '10px'
                                        },
                                    }}
                                />
                            </TableCell>
                            <TableCell align="center">
                                <TextField
                                    required
                                    variant="outlined"
                                    error={!isNumeric(numberOfAPacketsFound)}
                                    helperText={!isNumeric(numberOfAPacketsFound) ? "Only numeric values are valid" : ''}
                                    value={numberOfAPacketsFound}
                                    margin="normal"
                                    onChange={handleNumberOfAPacketsFoundChange(ballotBoxRefId)}
                                    inputProps={{
                                        style: {
                                          height: '10px'
                                        },
                                    }}
                                />
                            </TableCell>
                        </TableRow>
                    })}
                </TableBody>

                <TableFooter>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            Total number of PV-A packets found in the Box/ Boxes
                        </TableCell>
                        <TableCell align="center">
                            <TextField
                                required
                                variant="outlined"
                                error={calculateTotalNumberOfPVPackets() !== totalNumberOfPVPackets}
                                helperText={(calculateTotalNumberOfPVPackets() !== totalNumberOfPVPackets) ? "Total count mismatch" : ''}
                                value={totalNumberOfPVPackets}
                                margin="normal"
                                onChange={handleTotalNumberOfPVPacketsChange()}
                                inputProps={{
                                    style: {
                                      height: '10px'
                                    },
                                }}
                            />
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            Number of Packets rejected on various grounds after opening 'A' covers
                        </TableCell>
                        <TableCell align="center">
                            <TextField
                                required
                                variant="outlined"
                                error={!isNumeric(numberOfACoversRejected)}
                                helperText={!isNumeric(numberOfACoversRejected) ? "Only numeric values are valid" : ''}
                                value={numberOfACoversRejected}
                                margin="normal"
                                onChange={handleNumberOfACoversRejectedChange()}
                                inputProps={{
                                    style: {
                                      height: '10px'
                                    },
                                }}
                            />
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            <strong>No. of covers rejected on</strong>
                            various grounds after opening 'B' covers in accepted ballot papers receptacle
                        </TableCell>
                        <TableCell align="center">
                            <TextField
                                required
                                variant="outlined"
                                error={!isNumeric(numberOfBCoversRejected)}
                                helperText={!isNumeric(numberOfBCoversRejected) ? "Only numeric values are valid" : ''}
                                value={numberOfBCoversRejected}
                                margin="normal"
                                onChange={handleNumberOfBCoversRejectedChange()}
                                inputProps={{
                                    style: {
                                      height: '10px'
                                    },
                                }}
                            />
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            <strong>
                                No of postal ballot papers for the count in the receptacle for accepted ballot papers.
                            </strong>
                        </TableCell>
                        <TableCell align="center">
                            <TextField
                                required
                                variant="outlined"
                                error={!isNumeric(numberOfValidBallotPapers)}
                                helperText={!isNumeric(numberOfValidBallotPapers) ? "Only numeric values are valid" : ''}
                                value={numberOfValidBallotPapers}
                                margin="normal"
                                onChange={handleNumberOfValidBallotPapersChange()}
                                inputProps={{
                                    style: {
                                      height: '10px'
                                    },
                                }}
                            />
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            <strong>
                                Location of Postal Ballot Paper Counting Centre
                            </strong>
                        </TableCell>
                        <TableCell align="center">
                            <TextField
                                required
                                variant="outlined"
                                value={situation}
                                margin="normal"
                                onChange={handleSituationChange()}
                                inputProps={{
                                    style: {
                                      height: '10px'
                                    },
                                }}
                            />
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={2}>
                            <strong>
                                Time of commencement of the count of Postal Votes ballot papers
                            </strong>
                        </TableCell>
                        <TableCell align="center">
                            <TextField
                                variant="outlined"
                                type='datetime-local'
                                defaultValue={(timeOfCommencementOfCount == null ? "" : Moment(timeOfCommencementOfCount).format('YYYY-MM-DDTHH:mm'))}
                                margin="normal"
                                onChange={handleTimeOfCommencementOfCountChange()}
                                inputProps={{
                                    style: {
                                      height: '10px'
                                    },
                                }}
                            />
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="right" colSpan={3}>
                            <div className="page-bottom-fixed-action-bar">
                                <Button variant="contained" color="default" onClick={handleClickNext()}>
                                    Save & Next
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                </TableFooter>

            </Table>
        } else {
            return null;
        }
    }


    return <Processing showProgress={processing} label={processingLabel}>
        {getTallySheetEditForm()}
    </Processing>;

}